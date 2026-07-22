# 码多多 Skill Runtime 安全 MVP 设计

> 状态：已确认并通过规格审查

## 1. 目标

让具有配置权限的管理员把 Skill Registry 中已经发布的精确 revision 组成一个不可变集合，并安全地激活到唯一 Agent“码多多”。新集合只有在全部制品验证、物化和 Agno 加载成功后才进入提交阶段；准备阶段失败、取消或超时继续使用旧集合，CAS 结果未知时通过状态对账，并可通过相同流程回滚到上一集合。

本设计取代 `2026-07-20-maduoduo-skill-runtime-activation.md` 作为下一阶段的实施依据。旧计划保留作历史参考，但不再按 13 个任务完整执行。

## 2. 当前基线与开工门禁

当前系统已经支持：

- ZIP 上传、规范化、扫描和不可变 artifact；
- 基于后台权限与 MFA 的 revision 审核；
- `pending_review`、`published`、`rejected`、`archived` 生命周期；
- Skill Registry 私有 API 和 Web 管理页面；
- schema v2 目前只包含审核授权字段迁移；candidate set、active pointer、runtime 只读对象和激活函数都尚未实现。

但“审核通过”不等于“Agent 已加载”。开始 Runtime 实施前必须先完成：

1. 修复 Registry API 仍使用旧审核字段名导致的测试失败；
2. 跑通真实 PostgreSQL manager、runtime、backup、PUBLIC 角色负向测试；
3. 整理并提交当前工作树中的本地开发和上传错误处理改动；
4. 确认最新 Registry 镜像重新构建后，ZIP 上传与审核 E2E 仍通过。

任何 PostgreSQL 测试因缺少 DSN 而 skipped，都不算门禁通过。

## 3. 范围

### 3.1 本阶段包含

- 只支持固定 Agent ID `maduoduo`；
- 一个 AgentOS 实例；
- 管理员手工选择零到十六个 `published` revision；零个表示显式关闭全部 Skill；
- 创建不可变 candidate set；
- Agent 独立读取、复验、物化和加载完整集合；
- 单实例内串行激活、原子内存切换和旧请求排空；
- active、previous、candidate 状态展示；
- 未开始或不再需要的 candidate 受审计丢弃；
- 使用上一集合创建新 candidate 并按相同路径回滚；
- 无 active set 时以空 Skill 集合启动；
- 显式空集合用于关闭全部 Skill；
- 启动恢复、readiness、审计、部署和真实 E2E。

### 3.2 本阶段不包含

- GitHub、GitLab、GitCode 导入；
- Webhook、自动检查更新或自动激活；
- 多 Agent；
- 多 AgentOS 实例一致激活；
- 通用分布式事务或共识协议；
- Marketplace；
- Skill 脚本进程、网络或系统调用沙箱；
- 任意本地目录、任意 Git URL 或 Agent 直接访问 Provider。

## 4. 核心原则

1. **精确版本**：运行时只接受 Registry 中 `published` 的精确 revision UUID 和 artifact SHA-256，不接受 branch、路径别名或“最新版本”。
2. **完整集合切换**：一组 Skill 要么全部生效，要么全部不生效，不能出现混合 generation。
3. **加载前复验**：Agent 不信任数据库元数据，必须重新校验 artifact 摘要、大小、file index 和规范化目录。
4. **先准备后切换**：新 Skills 必须在后台完整验证，并证明 `AgentFactory` 能构建请求 Agent，才允许改变 active pointer。
5. **失败保留旧版本**：准备阶段失败、取消或超时都不影响当前 active generation；CAS 已提交但响应未知时必须通过状态对账，不能报告失败后盲目重试。
6. **运行请求固定版本**：每个请求在开始时取得一次 generation 引用，直到请求结束都不重新读取 active 引用。
7. **数据库是真源**：active pointer 是重启恢复和后台展示的唯一持久事实；内存 generation 必须与其一致。
8. **权限最小化**：Web 不读取 artifact，Agent 不持有 manager 或 Git Provider 凭据，runtime 数据库角色只能读取受限视图和调用受限激活函数。

## 5. 组件边界

### 5.1 Skill Registry

负责：

- 从 `0..16` 个 `published` revision 创建不可变 candidate set；空集合合法且表示显式关闭全部 Skill；
- 拒绝重复 Skill、未发布 revision、超过集合大小上限和非法 Agent ID；
- 通过 activation version 做 compare-and-swap；
- 保存 active pointer、previous set、失败码和控制事件；
- 提供 runtime 专用只读视图和受限激活函数。

不负责：

- 构建 Agno Agent；
- 把 artifact 发送给 Web；
- 直接修改运行中 Agent 的内存状态。

需要新建的固定对象为 `agent_skill_sets`、`agent_skill_set_items`、`active_agent_skill_sets`、三个 runtime 只读视图，以及 `activate_agent_skill_set`、`mark_agent_skill_set_failed`、`reconcile_agent_skill_activation` 三个 runtime 受限函数。manager service 另外提供受审计的 `discard candidate` 事务。不再扩展成多 Agent 或多实例通用模型。

固定数据库合同：

- `create candidate` 由 manager 事务完成，锁定所选 revision，要求全部为 `published`，并写 `skill_set_created` 事件；
- `activate` 只允许 runtime 角色调用，要求 candidate、expected activation version 和 assertion nonce 全部匹配；CAS 同一事务重新锁定全部 revision 并确认仍为 `published`，然后更新 active pointer 的 `active_set_id` 和 `previous_set_id`、把旧 active 改为 `superseded`、把 candidate 改为 `active` 并写事件；
- `mark failed` 只允许 runtime 角色在 candidate 尚未 active 且 activation version 未变化时调用；
- `reconcile` 只读返回目标 set 状态、当前 active set 和 activation version，用于 CAS 结果未知时对账；
- `discard candidate` 只允许 manager 在 set 仍为 `candidate` 时把它改为 `discarded` 并写 `skill_set_discarded` 事件；正在准备的 runtime 后续 CAS 会因状态变化失败；
- revision 状态约束禁止归档 active set 或 active pointer 的 immediate previous set 正在使用的 revision，保证一次回滚始终可用；
- manager 和 runtime 都不能直接 UPDATE/DELETE 集合或 active pointer，PUBLIC 没有视图和函数权限。

### 5.2 Agent artifact repository 与 materializer

artifact repository 只通过 runtime 数据库角色读取 candidate/active 集合和 artifact。materializer 使用 `skill-core` 把每个 artifact 重新验证后写入专用 generation 目录，并满足：

- 根目录固定为容器内绝对路径 `/run/aap-skills`；
- 目录位于有大小限制的 tmpfs；
- 写入临时 generation，完成前不可被运行请求看到；
- 禁止链接、设备、特殊权限、路径穿越和嵌套仓库；
- 对 artifact、file index 和实际文件逐项复验；
- 任一 Skill 失败即删除未完成 generation，并返回稳定错误码。

### 5.3 Agent runtime generation 与请求租约

AgentOS 不注册可变的 `Agent` 实例，而注册一个固定 ID 为 `maduoduo` 的 Agno `AgentFactory`。Factory 为当前产品的 run 请求创建新的 Agent，并显式复用现有 `ModelRuntimeSlot` 和同一个 lifespan-owned `AsyncPostgresDb`；只有 Skills、set ID 和 activation version 来自本次捕获的 generation。

当前 Web 只调用 `POST /agents/maduoduo/runs`。在 AgentOS 路由外增加本地 route guard 和 generation middleware：

1. 只对精确 run 路径和方法捕获当前不可变 `RuntimeGeneration` 并增加引用计数；
2. 通过 `ContextVar` 把捕获的 generation 交给 `AgentFactory`；
3. 一次 HTTP/SSE 响应完整结束、客户端断开或任务取消时在 `finally` 释放引用；
4. Factory 使用该 generation 的 `Skills` 构建本请求 Agent，因此完整 run/stream 生命周期不会混用新旧集合；
5. 已退休 generation 引用归零后才清理其 tmpfs 目录。

Agno 2.7.2 中会在缺少 `RequestContext` 时解析 `AgentFactory` 的 fork、resume 或其他 Agent 路径不属于当前产品能力。route guard 必须在进入 Agno resolver 前对这些路径返回固定 404/405，不能让它们抛出 `FactoryContextRequired`，也不能修改安装包。实施前用锁定版本枚举 AgentOS 路由，合同测试证明当前 run 路径可用、所有不兼容路径被本地保护层拒绝。

不实现通用公平读写锁。激活请求在单实例内使用一个非阻塞互斥锁串行化；锁已占用时立即返回 `activation_busy`。普通聊天请求不等待激活。最多允许一个尚未排空的 retired generation；存在第二个待退休 generation 风险时，新激活返回 `runtime_busy`，防止 tmpfs 无界增长。清理失败只记录告警并由下次启动清理孤儿目录，不能回滚已经成功的激活。当前产品没有 WebSocket run 路径，本阶段不新增或验收 WebSocket；未来新增该传输时必须先扩展同一租约边界。

默认 Agent 指令拆成稳定安全前缀和 capability 后缀：空集合时继续声明没有工具；非空集合时只声明可以使用当前审核 Skill 暴露的 Skill 工具，不得继续声称“没有工具或操作权限”。不得移除外部上下文不可信、禁止伪造执行结果等现有安全指令。

### 5.4 Agent Skill coordinator

coordinator 编排一次激活：

1. 取得 `maduoduo` 激活互斥锁；
2. 读取 candidate 和 expected activation version；
3. 物化全部 Skill；
4. 使用锁定的 Agno 版本执行 `Skills(loaders=[LocalSkills(..., validate=True)])`；
5. 验证 `AgentFactory` 能用新 Skills、现有 `ModelRuntimeSlot` 和 `AsyncPostgresDb` 构建请求 Agent；
6. 调用 Registry compare-and-swap 激活函数；
7. CAS 提交成功后，以不会执行外部 I/O 的内存赋值替换当前 generation；
8. 返回新 activation version，并异步等待旧 generation 引用归零。

若准备阶段失败，coordinator 调用 `mark_agent_skill_set_failed`，删除新 generation 并继续服务旧实例。激活总 deadline 为 60 秒；进入 CAS 前可以安全取消。CAS 调用开始后使用 cancellation shield 和 5 秒数据库 statement timeout，不能因客户端断开中断正在提交的事务。

若 CAS 调用结果未知，coordinator 保留 prepared generation 和同一个激活锁，立即把 Skill runtime 标为 `degraded`，阻止新聊天请求和新激活，并在同一 coordinator 内持续调用 `reconcile_agent_skill_activation`：

- 确认目标 set 已 active：使用保留的 prepared generation 完成内存切换，再恢复 `ready`；
- 确认 active pointer 未变化且目标仍为 candidate：调用 `mark failed`，删除 prepared generation，恢复旧 generation 和先前 capability；
- 确认目标已被 manager 丢弃：删除 prepared generation，恢复旧 generation 和先前 capability，并把本次结果固定为 activation conflict；
- 数据库持续不可达或仍无法判定：继续保留 prepared generation、保持失败关闭和激活锁，直到恢复或进程关闭；重启后按数据库 active pointer 收敛。

首次无法确认时 API 返回 `activation_result_unknown`；客户端只轮询状态，不能使用新请求 ID 盲目重试。对账在 coordinator 内执行，状态 API 只读取结果，不自行修改运行时。

若 CAS 提交后进程崩溃，进程已无法继续服务；重启时必须根据数据库 active pointer 恢复。CAS 成功后若内存状态出现不可能的内部不一致，readiness 立即变为 503，新的聊天请求失败关闭，禁止继续用与数据库不一致的旧 generation 响应。

### 5.5 Agent control API

新增仅内部网络可达的状态和激活 API：

- 状态读取使用 session 级 assertion；
- 激活和回滚要求 `admin:assistant:skills:configure`、近期密码+MFA assurance 和请求 UUID；
- API 不接受 ZIP、文件正文、任意路径或任意 Agent ID；
- 激活锁已经取得、并开始 Registry mutation 后，request ID 同时作为幂等键和 assertion nonce，按 actor + action + target + request ID 唯一保存于 Registry 控制事件；相同指纹返回原结果，不同指纹返回冲突，记录永久保留并随 Registry 备份；
- `activation_busy|runtime_busy` 在进入持久 mutation 前返回，是不写控制事件的瞬时拒绝；同一 request ID 可以在 busy 条件消失后重试；
- 同时到达的第二个激活请求返回稳定 `activation_busy`，不排无限队列。

### 5.6 Web BFF 与后台 UI

Web 负责权限和用户流程，不参与 artifact 数据面：

- 列出 `published` revision；
- 创建 candidate set；
- 请求 Agent 激活；
- 对尚未开始、Web 编排在调用 Agent 前明确失败，或管理员不再需要的 candidate 执行受审计丢弃；
- 展示 Registry active pointer 与 Agent runtime generation 的一致状态；
- 展示稳定失败码，不泄露数据库、文件路径、Token 或 Skill 正文；
- 回滚通过“从 active pointer 的 immediate previous set 克隆为新 candidate，再按正常激活流程执行”，不直接倒改 active pointer。

库与审核界面继续独立存在；Runtime 配置界面只负责“哪些已发布 Skill 对码多多生效”。

## 6. 数据与状态

### 6.1 集合状态

- `candidate`：不可变内容已经创建，尚未激活；
- `active`：数据库 active pointer 当前指向该集合；
- `superseded`：曾经 active，已被后续集合替代，可作为回滚来源；
- `failed`：准备或激活失败，保存稳定 failure code，不保存私密异常文本。
- `discarded`：从未激活且被管理员或 Web 编排明确放弃，不再计入 candidate 上限。

集合内容一经创建永不修改。失败后重试必须创建新的 candidate，避免同一 ID 表示不同执行尝试。

### 6.2 generation

`RuntimeGeneration` 至少包含：

- set ID，可为空；
- activation version，未配置时固定为 0；
- `configured` 标志；
- 只读 Skill 元数据；
- 已验证的 Agno `Skills`；
- 可选 generation 目录句柄，空集合时为空；
- 当前引用计数和 retired 状态。

运行请求只接触 `RuntimeGeneration`，不直接查询 Registry。

没有 active pointer 时使用 `{configured:false,setId:null,activationVersion:0,skills:empty}`。显式激活空集合时使用 `{configured:true,setId:<uuid>,activationVersion>=1,skills:empty}`。两者行为都没有 Skill，但后台状态、回滚来源和审计含义不同。

## 7. 启动、关闭与恢复

- 无 active pointer：加载 `configured=false` 的空 Skill generation 并 ready；
- 有合法 active pointer：在全局 readiness 成功前完成复验、物化和 Agent 构建；
- active artifact 缺失、损坏、数据库不可达或 Agno 验证失败：liveness 保持 200，readiness 返回 503，聊天能力失败关闭；
- 关闭时停止接收新请求，最多等待 30 秒让 generation 引用归零，然后关闭数据库并退出；未排空目录由容器 tmpfs 生命周期清理；
- 启动时清理不属于数据库 active set 的孤儿 generation；清理不能越出固定 runtime root；
- `AGENT_ENABLED=false` 仍是关闭整个 Agent 的部署级紧急开关，不另外引入功能重复的 Skill kill switch。

## 8. 安全边界

- 审核与配置是两个独立权限；拥有审核权限的上传者可以按当前产品规则自审，但没有配置权限就不能把 Skill 激活到 Agent；
- 所有 mutation 都需要服务端 actor、permission、assurance、request ID、nonce 和目标绑定；
- Agent 容器不开放 Skill Runtime 主机端口；
- Web、Agent 日志和审计事件不得保存 artifact、脚本正文、控制密钥或数据库 DSN；
- tmpfs 只解决不可变物化和残留，不是脚本沙箱；
- 审核通过的脚本仍拥有 Agent 容器进程可用的能力，这是本阶段明确接受的剩余风险；
- Agent 继续保持只读根文件系统、最小 capability、非 root 运行和受限网络。

## 9. 部署变化

生产 Compose 需要：

- Agent 挂载 `/run/aap-skills` executable tmpfs，并设置明确大小上限；
- 新增 runtime 只读数据库 URL Docker Secret；
- Agent 配置固定 runtime root、激活超时和关闭排空超时；
- Skill Registry migration 在 Agent 启动前完成；
- Web 和 Agent 只通过 Docker backend 网络访问内部服务；
- 不启用本地开发专用的 `SKILL_REGISTRY_ALLOW_LOOPBACK`，不发布 Registry 主机端口。

固定资源合同：单 artifact 规范化后不超过 5 MiB；每个集合允许 0..16 个 Skill、总解压大小不超过 24 MiB；每个 Agent 最多保留 20 个 `candidate`，通过成功激活、标记失败或受审计丢弃释放名额；`/run/aap-skills` tmpfs 固定 96 MiB；同步激活 API deadline 60 秒、CAS statement timeout 5 秒、关闭排空 30 秒。未知 CAS 的后台对账可以超过同步 API deadline，但必须保持失败关闭和禁止新激活。Agent 的 Agno 依赖从范围锁定为精确 `agno[anthropic,google,openai]==2.7.2`。

本地 `npm run dev` 可以继续通过受控 `127.0.0.1:7788` 代理访问 Registry，但该代理不进入生产 Compose。

## 10. 错误与可观测性

对外只返回稳定错误码：

- `candidate_invalid`；
- `artifact_unavailable`；
- `artifact_invalid`；
- `skill_validation_failed`；
- `agent_build_failed`；
- `activation_busy`；
- `runtime_busy`；
- `activation_conflict`；
- `activation_timeout`；
- `activation_result_unknown`；
- `runtime_degraded`。

内部日志包含 request ID、set ID、activation version、阶段和稳定错误码，不包含正文或凭据。后台同时展示 Registry active truth 和 Agent loaded truth；两者不一致时必须显示 degraded，不能伪装成功。

独立的 Skill runtime status 固定返回 `skillCapability=unconfigured|ready|preparing|degraded`、`configured`、`activeSetId`、`loadedSetId`、`previousSetId`、`activationVersion` 和最近一次稳定 failure code。不得修改现有模型 `capability=placeholder|available|degraded` 字段及其严格 JSON 合同。`preparing` 期间旧 generation 可服务，因此 readiness 保持 200；Skill `degraded`、active/loaded 不一致、运行数据库不可达或现有模型 capability 为 `degraded` 时 readiness 返回 503。模型处于现有合法 placeholder/deployment 模式且 Skill 状态为 `unconfigured|ready|preparing` 时，不额外改变当前 readiness 语义。现有健康响应 JSON 形状保持不变，只调整内部 ready 判定；后台通过独立 Skill status API 读取新增字段。

HTTP 映射固定为：输入或 candidate 非法 400，`artifact_invalid|skill_validation_failed` 为 422，权限/MFA 不足 403，不存在 404，幂等或 activation version 冲突 409，`activation_busy|runtime_busy` 为 423，准备/CAS 超时 504，`artifact_unavailable|agent_build_failed|activation_result_unknown|runtime_degraded` 为 503。响应正文只包含 request ID 和稳定错误码。

## 11. 验收标准

以下全部通过才算 MVP 完成：

1. 一个审核通过的 Skill 能从后台组成 candidate 并激活到码多多；
2. 使用一个确定性测试 Skill，通过记录其 Skill 工具调用证明聊天请求实际加载了该 Skill，而不是根据模型自然语言或状态接口猜测；
3. 未发布、已拒绝、已归档或重复 Skill 不能进入 candidate；
4. 损坏 artifact、摘要不符、非法目录或 Agno 加载失败都保留旧 active generation；
5. 激活过程中已经开始的请求使用旧 generation，新请求在切换后使用新 generation；
6. 当前 `POST /agents/maduoduo/runs` 的普通 HTTP、SSE 和客户端取消路径都会在完整生命周期后释放 generation 租约；不兼容的 Factory 路径会在 Agno resolver 前被固定拒绝；
7. 两个并发激活只有一个执行，另一个得到稳定 busy/conflict；
8. CAS 响应丢失时状态对账能确认成功或失败，不生成重复 activation；
9. CAS 结果未知时，确认已提交会用保留 generation 完成切换，确认未提交会清理恢复，持续不可确认会保持失败关闭并拒绝新激活；
10. 未知 CAS 对账发现 candidate 已丢弃时会清理 prepared generation、恢复旧 generation，并返回确定冲突；
11. 回滚产生新的 activation version，并恢复上一集合的真实行为；
12. active pointer 的 immediate previous set 在下一次成功激活前不能被归档，并始终可克隆回滚；
13. Agent 重启后从数据库 active pointer 恢复相同集合；
14. runtime 角色不能读取基础审核表、修改集合或绕过受限函数；
15. 无权限或缺少近期 MFA 的用户不能激活、回滚或丢弃 candidate；
16. candidate 可以被受审计丢弃，20 个上限不会永久阻塞后续配置；
17. active 和 immediate previous set 中的 revision 不能被归档；
18. Docker 内 Agent 使用 96 MiB tmpfs，宿主机没有 Registry 或 Runtime 数据端口；
19. 真实 PostgreSQL、Registry、Agent、Web 和 Docker E2E 全部执行，skipped 不计通过。

## 12. 后续阶段

MVP 稳定后再分别设计和实施：

1. GitHub、GitLab、GitCode 固定 commit 导入；
2. 多 Agent；
3. 多 AgentOS 实例一致激活；
4. Skill 脚本隔离或独立执行沙箱；
5. 自动更新检查和 Marketplace。
