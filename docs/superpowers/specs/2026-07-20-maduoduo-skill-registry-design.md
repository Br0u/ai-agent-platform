# 码多多 Skill Registry、审核与 Git 导入设计规格

> 日期：2026-07-20
> 状态：待书面确认
> 前置规格：`docs/superpowers/specs/2026-07-16-maduoduo-single-agent-loop-design.md`、`docs/superpowers/specs/2026-07-17-admin-assistant-model-configuration-design.md`

## 1. 背景与现状

当前仓库已经把唯一 Agent“码多多”的模型调用、会话、内部认证和后台动态模型配置做成真实闭环，但 Skill 仍是明确的未接入能力：

- `apps/agent/src/agent_service/default_agent.py` 仍以 `tools=None` 创建 Agent；
- `apps/agent/src/agent_service/skills/README.md` 明确没有注册 Skill、Tool 或 Knowledge；
- 后台 Skill/Marketplace 页面仍是路由和占位骨架；
- 仓库没有 Skill 元数据、审核、版本、绑定或制品存储表；
- Compose 中 Web 只有 `frontend + backend`，没有外网出口；Agent 有 `model_egress`，但该出口只应服务模型调用；
- Agent 容器根文件系统只读，现有 `/tmp` 还是 `noexec`，不能直接执行运行时下载的脚本；
- 当前备份只包含 `public`、`drizzle` 和 `agno`，动态模型使用的 `agent_control` 被有意排除。

项目锁定 Agno `2.7.2`。该版本可用 `Skills(loaders=[LocalSkills(path=..., validate=True)])` 加载本地 Skill，并给模型暴露：

- `get_skill_instructions`；
- `get_skill_reference`；
- `get_skill_script`。

其中 `get_skill_script(..., execute=True)` 会通过 `subprocess.run` 在 Agent 容器内直接执行脚本。Agno 的校验主要验证 Skill 结构和 frontmatter，不是恶意代码沙箱。因此，本规格不把“通过 Agno 校验”误写成“安全”，而是把**人工审核、不可变版本和显式绑定**作为是否可加载的准入门槛。

## 2. 目标

1. 建立平台自己的 Skill Registry，统一保存 Skill、不可变 revision、来源、审核记录和 Agent 绑定关系。
2. 支持管理员从浏览器上传 ZIP，不要求在服务器本地放文件。
3. 支持从 GitHub、GitLab、GitCode 的公开或已授权私有仓库导入。
4. 无论上传还是 Git 导入，都先复制为平台内部不可变制品，再进入同一套验证和审核流程。
5. 只有已发布的明确 revision 才能绑定到码多多；远端仓库后续变化不得自动影响运行中 Agent。
6. 后台可查看文件树、源码差异、脚本、来源 commit、摘要、审核人和当前激活集合。
7. 码多多运行时使用 Agno `2.7.2` 的 `LocalSkills` 读取已发布制品，并能执行审核通过的 Skill 脚本。
8. 激活失败时保留旧 Skill 集合，不允许部分加载或静默跳过。
9. Skill 制品和配置进入正式备份、恢复和审计范围。
10. 为未来迁移 S3/MinIO、自动更新检查和多 Agent 绑定保留清晰接口，但一期不提前实现。

## 3. 非目标

本阶段不包含：

- 公开 Skill Marketplace、计费、评分、评论或普通用户自行安装；
- Agent 运行时直接从 GitHub/GitLab/GitCode 拉取；
- 自动跟随 branch、自动发布、自动激活或远端删除联动；
- 任意 Git URL、SSH clone、`file://`、Git hooks、submodule、Git LFS 或嵌套仓库；
- 在线编辑 Skill 文件或在后台直接改脚本；
- 自动证明第三方代码安全、自动确认许可证合规；
- 完整进程级、容器级或虚拟机级脚本沙箱；
- Skill 自带依赖安装、`pip install`、`npm install` 或动态构建镜像；
- 多 Agent、Team、Workflow 的 Skill 分配；
- 自动 Webhook 更新。一期只提供人工“检查更新”和“重新导入”；
- 独立对象存储集群。一期的小制品直接存 PostgreSQL。

## 4. 已确认决策

| 主题 | 决策 |
| --- | --- |
| Skill 来源 | 后台 ZIP 上传；GitHub、GitLab、GitCode 导入 |
| 服务端本地上传 | 不需要；浏览器通过 Admin BFF 上传 |
| 内部真源 | 平台自己的不可变 Skill revision，不直接依赖远端仓库 |
| 远端版本 | branch/tag 必须解析成完整 commit SHA，再下载和固化 |
| 制品存储 | 一期 PostgreSQL `bytea`；通过 `SkillArtifactStore` 抽象未来迁移对象存储 |
| 生命周期 | 成功验证后 `pending_review`；审核后 `published` 或 `rejected`；已发布可 `archived` |
| 审核原则 | 上传者/导入者不能审核自己的 revision；每个新 revision 都重新审核 |
| Agent 绑定 | 只能绑定具体的 `published` revision，不绑定“最新版”或 branch |
| 运行时加载 | Agno `2.7.2` `Skills + LocalSkills(validate=True)` |
| 脚本执行 | 允许审核通过的 Skill 通过 Agno 工具执行；风险由审核和现有容器边界承担 |
| 激活策略 | 候选集合完整加载成功后原子替换；失败保留旧集合 |
| 更新策略 | 一期手工检查/重新导入；不自动发布或激活 |
| 网络边界 | 新增 Skill Registry 服务和专用 Git 出口，不借用 Web 或 Agent 的模型出口 |
| 备份 | 新增 `skill_registry` schema，并明确加入加密备份和恢复验收 |
| 页面位置 | 复用 `/admin/assistant`，增加 Skill 库、审核和码多多绑定区域 |

## 5. 方案比较

### 5.1 只挂宿主机目录

优点是代码最少。缺点是只能由运维拷文件，无法做浏览器上传、Git 导入、权限、双人审核、不可变版本、回滚和集群一致性；容器重建后还需要额外持久卷协议。该方案不满足产品需求。

### 5.2 Agent 直接读取 Git 仓库

优点是看起来省掉制品库。实际会把仓库删除、branch 漂移、Git 凭据、网络故障和供应链变化直接带入运行时，也无法证明当前执行的具体内容。该方案明确禁止。

### 5.3 平台 Registry + 不可变 revision（采用）

上传和 Git 导入只负责生成候选制品；审核、发布、绑定和运行时加载全部基于同一内部 revision。它比本地目录多出存储和控制面，但能回答“谁上传、审核了什么、哪一版正在运行、怎么回滚”，也是第三方库接入的必要基础。

### 5.4 PostgreSQL 与对象存储

一期单个 ZIP 上限 5 MiB，数量和并发都有限。直接存 PostgreSQL 可获得同一事务、同一备份、少一个基础设施依赖，适合当前单机 Compose。对象存储更适合大制品和大规模分发，但现在接入会扩大部署面。因此一期使用 PostgreSQL，同时从第一天把读写封装为 `SkillArtifactStore`；达到任一阈值后再迁移：

- Skill 制品总量超过 2 GiB；
- 单制品需要超过 5 MiB；
- 部署进入多节点且数据库分发成为明显瓶颈。

## 6. 总体架构

```text
Browser /admin/assistant
  -> Web Admin BFF
     - session / exact permission / recent MFA
     - request validation / no-store / audit actor
  -> private Skill Registry API
     - upload validation
     - Git provider adapters and durable import jobs
     - encrypted provider connections
     - immutable artifact / review / skill-set management
     - skill_registry database role
  -> Git egress proxy -> GitHub / GitLab / GitCode allowlist

Web Admin BFF
  -> private Agent skill-control API
     - load only published revisions
     - verify artifact digest
     - materialize to executable tmpfs
     - Agno LocalSkills candidate load
     - run-generation lock and atomic activation
  -> 码多多 / AgentOS

PostgreSQL
  - public / drizzle: user, permission and Web audit
  - agno: AgentOS session state
  - agent_control: dynamic model configuration
  - skill_registry: skills, artifacts, sources, review and active sets
```

新增 `skill-registry` 是一个边界明确的内部服务，不是新的 Agent：

- 只有它保存/解密 Git Provider 凭据和写入候选制品；
- Web 不直接连接 `skill_registry` 数据库，也不获得通用外网；
- Agent 不持有 Git 凭据，不访问 Git Provider；
- Agent 只读取已发布制品和绑定集合，并拥有激活指针所需的窄写权限；
- 一期服务内包含持久任务轮询器，不再拆 API、队列和 worker 三套部署。

## 7. Skill 包合同

### 7.1 目录结构

每个上传或导入目标必须最终解析为且仅为一个 Skill 根目录：

```text
skill-name/
  SKILL.md
  scripts/       # 可选
  references/    # 可选
```

要求：

- `SKILL.md` 必须是 UTF-8，包含 Agno `2.7.2` 认可的 `name` 和 `description`；
- 根目录名必须与规范化后的 `name` 一致；
- `name` 在未归档 Skill 中全局唯一，避免 Agno 对同名 Skill 后加载覆盖；
- `references/` 只允许 UTF-8 文本；
- `scripts/` 只允许 UTF-8 文本脚本；一期支持 Python 3 和 POSIX `sh` shebang；
- 不支持二进制、动态链接库、解释器包、压缩包套压缩包或运行时安装依赖；
- Skill 依赖的 Python 包必须已经锁定并构建进 Agent 镜像，否则审核不得发布。

`allowed-tools` 只作为 Skill 元数据展示。Agno `2.7.2` 不把它当成强制授权机制，后台不得把它标为安全隔离能力。

### 7.2 大小和文件限制

服务端在解压过程中执行硬限制，不相信 ZIP header 声明：

| 项目 | 一期上限 |
| --- | --- |
| 上传/下载压缩体 | 5 MiB |
| 解压后总大小 | 20 MiB |
| 文件数 | 128 |
| 单文件 | 2 MiB |
| 路径深度 | 8 层 |
| 文件名长度 | 160 字节 |

拒绝以下内容：

- 绝对路径、`..`、NUL、重复规范化路径和大小写冲突路径；
- symlink、hardlink、device、FIFO、socket 或特殊权限位；
- ZIP bomb、加密 ZIP、nested archive；
- `.git`、Git hooks、submodule、LFS pointer；
- 控制字符文件名、不可解码的 `SKILL.md`/reference/script；
- 不在允许清单内的脚本解释器。

验证成功后，服务端按规范路径顺序重新打包为 canonical ZIP，清除上传者提供的时间戳、owner 和权限噪声；`artifact_sha256` 计算 canonical ZIP，而不是未经信任的原始 ZIP。

### 7.3 静态检查

发布前自动检查并展示：

- Agno Skill 结构/frontmatter 校验；
- 文件树、文件类型、shebang 和可执行脚本清单；
- 疑似密钥、Token、私钥和内嵌凭据；
- 外部 URL、网络调用、子进程、文件写入、环境变量读取和动态代码执行特征；
- Python import 是否在运行镜像依赖清单内；
- 与上一个已发布 revision 的文本 diff；
- `license` frontmatter 或仓库许可证文件是否存在。

静态检查用于阻断明确违规和辅助人工审核，不声称能识别所有恶意行为。管理员必须确认其有权导入和使用第三方内容。

## 8. 数据模型

新增由独立 migrator 拥有的 `skill_registry` schema。

### 8.1 `skills`

稳定 Skill 身份，不保存可变正文：

| 字段 | 含义 |
| --- | --- |
| `id` | UUID 主键 |
| `slug` | 唯一规范名，与 Agno Skill name 对齐 |
| `display_name` | 后台展示名 |
| `description` | 当前展示摘要，不作为运行时真源 |
| `created_by` / `created_at` | 创建审计 |
| `archived_at` | Skill 级归档；归档后不能新增 revision 或绑定 |

### 8.2 `skill_revisions`

每次成功验证生成一条不可变 revision：

| 字段 | 含义 |
| --- | --- |
| `id` | UUID 主键 |
| `skill_id` / `revision_no` | Skill 内单调递增版本，组合唯一 |
| `state` | `pending_review | published | rejected | archived` |
| `source_type` | `upload | github | gitlab | gitcode` |
| `source_commit_sha` | Git 来源的完整 commit SHA；上传为空 |
| `source_path` | 仓库内 Skill 根路径；上传为空 |
| `manifest_json` | 解析后的 name、description、license、scripts、references |
| `artifact_sha256` | canonical ZIP SHA-256，唯一校验依据 |
| `created_by` / `created_at` | 上传或导入人 |
| `reviewed_by` / `reviewed_at` | 审核人和时间 |
| `rejection_reason` | 拒绝原因，拒绝时必填 |
| `published_at` / `archived_at` | 生命周期时间 |

`pending_review` 只能转为 `published` 或 `rejected`；`published` 只能转为 `archived`。状态变化不修改制品。需要修正内容时必须创建新 revision。

### 8.3 `skill_revision_artifacts`

| 字段 | 含义 |
| --- | --- |
| `revision_id` | 一对一主键 |
| `archive_bytes` | canonical ZIP `bytea` |
| `compressed_size` / `extracted_size` | 配额和审计 |
| `file_count` | 文件数 |

制品与列表元数据分表，普通查询不读取 `bytea`。`PostgresSkillArtifactStore` 只通过 `revision_id + artifact_sha256` 读写；未来对象存储实现保持同一接口。

### 8.4 `skill_revision_files`

保存规范路径、类型、大小、SHA-256、是否脚本/引用、shebang 和静态检查结果。后台文件浏览和 revision diff 优先使用该索引，按需从制品读取正文。

### 8.5 Git 来源与连接

- `git_provider_connections`：Provider、主机、外部账户/安装 ID、凭据密文、nonce、key version、创建/更新/吊销时间；
- `skill_sources`：Provider、connection、稳定仓库 ID、owner/repo、Skill path、默认 ref；
- `skill_import_jobs`：请求 ref、解析后的 commit SHA、状态、错误类别、尝试次数、操作者和时间；
- `skill_source_checks`：某来源最近一次远端 commit 检查结果，不创建 revision。

Provider 凭据和 OAuth refresh token 使用专用 `SKILL_SOURCE_ENCRYPTION_KEY` 做 AES-256-GCM 认证加密，不复用模型配置密钥、认证密钥或备份密钥。

### 8.6 Agent Skill 集合

- `agent_skill_sets`：不可变集合头，固定 `agent_id=maduoduo`，包含 `set_no`、创建人、状态和失败原因；
- `agent_skill_set_items`：集合中的具体 `skill_revision_id`；
- `active_agent_skill_sets`：每个 Agent 唯一活动指针及 `activation_version` 乐观锁；
- `skill_control_events`：导入、审核、发布、激活、回滚和失败的服务端事件，不保存正文和凭据。

集合内不允许重复 Skill name。归档正在使用的 revision 前必须先激活不含它的新集合；数据库约束和服务层都拒绝直接归档活动 revision。

## 9. 生命周期

```text
upload/import request
  -> validate and canonicalize
     -> failed: request/job records structured error; no revision
     -> passed: immutable pending_review revision
        -> reviewer rejects -> rejected
        -> reviewer approves -> published
           -> bind into candidate skill set
              -> Agent prepare + activate
                 -> success: active / previous set superseded
                 -> failure: candidate failed / previous set remains active
           -> unbound -> archived
```

重要边界：

- “上传成功”只表示得到 `pending_review`，不是可用；
- “审核通过”只表示 `published`，不会自动绑定；
- “加入候选集合”不等于运行时已生效；
- 只有 Agent 返回激活成功并更新 `activation_version` 后，页面才显示“运行中”；
- 上传/导入者不能审核自己创建的 revision；超级管理员也不例外；
- 同一远端 commit 和 path 已存在相同摘要时返回已有 revision，不重复造版本；
- 远端更新必须生成新的 `pending_review` revision，重新审核和激活。

## 10. 上传与 Git 导入

### 10.1 浏览器 ZIP 上传

1. 管理员在 `/admin/assistant` 选择 ZIP，并选择“创建新 Skill”或“给现有 Skill 添加 revision”。
2. Web 只做 MIME、请求体上限和权限检查，通过私有网络流式转发到 Skill Registry；不落 Web 本地磁盘。
3. Registry 在受限临时目录中流式验证、解压、扫描和 canonicalize。
4. 成功后用一个数据库事务写入 revision、文件索引、制品和事件。
5. 临时文件立即清除；服务器重启不依赖任何上传目录。

### 10.2 Git 导入

管理员提交 Provider、connection、仓库、ref 和 Skill path。Registry 先创建持久 `queued` job，任务轮询器通过 `FOR UPDATE SKIP LOCKED` 领取并执行：

1. 用 Provider API 校验仓库访问权；
2. 将 branch/tag 解析为完整 commit SHA；
3. 只按固定 Provider adapter 生成 API URL；
4. 下载固定 commit 的 archive，或按受限 tree/raw-file API 获取目标路径；
5. 禁止跨主机 redirect，并重新验证每次 redirect；
6. 应用与 ZIP 上传完全相同的大小、路径、类型、扫描和 canonicalize 流程；
7. 事务写入 `pending_review` revision；
8. job 标记 `succeeded`，失败则记录稳定错误码和脱敏说明。

一期 Provider 策略：

- GitHub：公开仓库可匿名；私有仓库优先 GitHub App installation token；下载固定 commit archive；
- GitLab.com：公开仓库可匿名；私有仓库使用 OAuth 或仅含 `read_repository` 的项目/部署 Token；使用 repository archive 的 `sha + path`；
- 自建 GitLab：主机必须先进入部署级允许列表，完成 HTTPS、DNS/IP 和 redirect 校验；
- GitCode：公开仓库匿名能力以实际 API 返回为准；私有仓库使用 OAuth 或只读 Token；通过 API v5 tree/raw-file adapter 获取固定 ref 下的受限路径；
- Token 只放 Authorization header，不进入 URL、日志、审计或错误信息。

不接受用户直接提交 clone URL。owner、repo、ref 和 path 分字段校验后由 adapter 构造 URL，从根上缩小 SSRF 和凭据泄漏面。

### 10.3 检查更新

“检查更新”只解析当前配置 ref 的远端 commit：

- commit 未变化：更新检查时间；
- commit 变化：显示“有更新”，不下载、不审核、不激活；
- 管理员点击“重新导入”后才创建 import job 和新 `pending_review` revision。

未来 Webhook 即使接入，也最多自动创建 `pending_review`，不得绕过人工审核或 Agent 激活。

## 11. Provider 凭据

### 11.1 连接方式

- GitHub：部署 GitHub App；安装授权后只保存 installation ID，短期 installation token 用时生成且不持久化；
- GitLab.com：OAuth connection；也允许项目范围的 `read_repository` Token；
- 自建 GitLab：部署先配置允许主机和 OAuth client，或由管理员录入只读项目/部署 Token；
- GitCode：OAuth connection 或只读个人访问 Token。

公开仓库无需创建 connection，但仍只能访问固定 Provider 主机。

### 11.2 凭据处理

- 浏览器提交 Token 必须经过最近 10 分钟密码 + TOTP 验证；
- Web 不持久化、不回显、不记录 Token，请求和响应均 `Cache-Control: no-store`；
- Registry 收到后立即加密，只返回 connection metadata 和末四位；
- 明文只在一次 Provider 请求期间存在于内存；
- GitHub App 私钥、OAuth client secret 和 `SKILL_SOURCE_ENCRYPTION_KEY` 使用 Docker Secret；
- Agent 和 Web 不挂载 `SKILL_SOURCE_ENCRYPTION_KEY`；
- 连接吊销后不能发起新导入，已固化 revision 和运行中 Skill 不受影响。

## 12. 审核与授权

新增精确权限：

| 权限 | 能力 |
| --- | --- |
| `admin:assistant:skills` | 查看 Skill、revision、来源和运行状态 |
| `admin:assistant:skills:upload` | 上传 ZIP、创建 Git 导入、管理自己的导入任务 |
| `admin:assistant:skills:connections` | 创建、更新和吊销 Provider connection |
| `admin:assistant:skills:review` | 查看完整内容并批准/拒绝他人 revision |
| `admin:assistant:skills:configure` | 创建候选集合、激活和回滚码多多 Skill 集合 |

以下动作要求最近 10 分钟密码 + TOTP：

- 新增/替换/吊销 Provider 凭据；
- 发布或拒绝 revision；
- 激活、清空或回滚 Skill 集合；
- 归档已发布 revision。

审核页必须展示：来源仓库和固定 commit、artifact SHA-256、完整文件树、自动检查结果、脚本正文、外部 URL、依赖、许可证信息、与前版 diff、上传/导入人。审核动作要求确认以下事实：

1. 已检查全部脚本和重要引用；
2. 已确认来源与使用权；
3. 理解脚本将在 Agent 容器内执行；
4. 审核人不是本 revision 的创建人。

前端隐藏按钮不是授权。Web BFF 和 Registry 必须各自验证权限/actor assertion；Registry 还要从数据库再次验证创建人与审核人不同。

## 13. Agent 运行时加载与激活

### 13.1 运行时物化

Agent 容器新增专用 tmpfs：

```text
/run/aap-skills:rw,exec,nosuid,nodev,size=64m
```

根文件系统和 `/tmp` 继续只读/`noexec`。每个候选集合物化到随机 generation 目录：

```text
/run/aap-skills/generations/<set-id>-<nonce>/<skill-name>/...
```

Agent 对每个 item 执行：

1. 从只读 runtime view 读取 `published` revision 和 canonical ZIP；
2. 验证数据库状态、集合内 name 唯一和 artifact SHA-256；
3. 使用与 Registry 相同的安全解压规则写入新 generation；
4. 文件权限固定为目录 `0700`、普通文件 `0600`、脚本 `0700`；
5. 构造 `Skills(loaders=[LocalSkills(generation_path, validate=True)])`；
6. 校验加载后的 Skill name 集合与数据库候选集合完全一致；
7. 任一加载 warning、缺失、重复或不一致都视为候选失败，而不是忽略。

Agno `Skills` 对部分非校验异常会记录 warning 后继续，因此平台必须做第 6 步的集合等值校验，不能仅以构造函数未抛错判断成功。

### 13.2 原子激活

当前部署只有一个 AgentOS 进程。新增 `SkillGenerationCoordinator`：

1. Web 通过 Registry 创建不可变 candidate set；
2. Web 调用 Agent 私有 `activate` API，携带 set ID 和预期 `activation_version`；
3. Agent 在锁外完成下载、摘要验证和完整候选加载；
4. Agent 获取写锁，阻止新 run 入场，并等待已开始 run 释放旧 generation 读租约；
5. 所有可能失败的候选校验完成后，在数据库事务中重新确认全部 revision 仍为 `published`，再 CAS 更新活动指针和集合状态；
6. 事务提交后，在同一写锁内做一次不含 I/O 的 `maduoduo.skills` 引用替换；
7. 释放写锁，新 run 使用新 generation；
8. 旧 generation 在没有租约后删除。

候选准备、等待或 CAS 失败时：

- 旧活动指针和旧 `maduoduo.skills` 保持不变；
- candidate set 标记 `failed` 并写脱敏错误类别；
- 临时候选 generation 删除；
- 页面显示失败，不能显示“部分生效”。

数据库提交与内存引用替换之间不执行任何可失败操作，也不放行新 run。如果进程在这个极短窗口被外部终止，Supervisor 重启后必须以数据库活动指针恢复同一 generation；不得尝试在旧进程中跨事务模拟分布式回滚。

空集合是合法集合，用于显式关闭全部 Skill；成功激活后 `maduoduo.skills=None`。

### 13.3 启动恢复

- 没有活动指针：Agent 正常启动，Skill capability 为 `unconfigured`，不挂 Skills；
- 有合法活动指针：启动时在 readiness 成功前完成摘要验证、物化和 LocalSkills 加载；
- 活动指针存在但 revision 缺失、非 published、摘要错误或加载失败：liveness 保持成功，readiness 返回 503，Skill capability 为 `degraded`；
- 不允许静默以“无 Skill”继续提供看似正常的真实 Agent；
- 当前单实例假设继续成立，多实例一致激活另行设计。

## 14. 脚本执行风险与边界

本阶段接受“只允许已审核 Skill”作为脚本准入策略，但必须明确它不是沙箱：

- Agno `2.7.2` 使用 `subprocess.run` 直接执行脚本；
- 子进程以 Agent 用户运行，继承 Agent 进程环境、文件可见性和网络；
- 脚本可能读取环境变量、访问模型出口、消耗 CPU/内存、启动子进程或尝试外传数据；
- 人工审核和静态扫描可能漏掉恶意或被混淆的代码；
- `no-new-privileges`、非 root、cap drop、只读根文件系统、CPU/内存/PID 限制和临时目录只降低影响，不等于隔离；
- Agno 工具参数允许脚本执行超时，调用链仍必须受现有 Agent run 总超时约束，但这不构成可靠的子进程沙箱。

一期保留这些限制并在审核页明确警告。真正需要运行不完全可信 Skill 时，必须另开阶段实现独立 executor 容器、最小环境、无默认网络、资源配额、强制 kill 和输出上限；不能仅修改文案后宣称安全。

## 15. 内部与外部 API

### 15.1 Web Admin BFF

统一位于 `/api/v1/admin/assistant/skills`：

- `GET /`：Skill 列表、revision 状态和当前绑定摘要；
- `POST /uploads`：multipart ZIP 上传；
- `POST /imports`：创建 Git import job；
- `GET /imports/:jobId`：轮询任务；
- `POST /sources/:sourceId/check`：检查远端 commit；
- `GET /:skillId/revisions/:revisionId`：revision、文件树和检查结果；
- `GET /:skillId/revisions/:revisionId/files/*`：受限文本文件内容；
- `POST /:skillId/revisions/:revisionId/review`：批准或拒绝；
- `POST /skill-sets/activate`：创建并激活集合；
- `POST /skill-sets/:setId/rollback`：用历史集合内容创建新集合并激活；
- `GET/POST/DELETE /connections`：Provider connection 管理。

所有 mutation 使用明确 JSON/multipart schema、CSRF 防护、`Cache-Control: no-store`、幂等键和结构化错误。上传、import、review 和 activate 都使用 `expectedState` 或 `expectedActivationVersion` 防止并发覆盖。

### 15.2 Skill Registry 私有 API

只在 `backend` 网络暴露，使用独立 `SKILL_REGISTRY_CONTROL_KEY`，不对宿主机发布端口。Web 传递服务端生成的 actor、权限和 MFA assurance；Registry 验证内部凭据、动作权限、状态机和双人规则。

### 15.3 Agent 私有 API

沿用 Agent control 路径和独立内部认证，新增：

- `GET /internal/control/skills/status`；
- `POST /internal/control/skills/activate`。

浏览器不能直接调用。请求中只传 set ID 和乐观锁版本，不传 ZIP、Git Token 或文件正文。

## 16. 后台页面

复用 `/admin/assistant`，新增三个区域：

### 16.1 Skill 库

- 按状态、来源和名称筛选；
- 显示当前已发布 revision、来源、摘要、最近更新时间和是否已绑定；
- 提供“上传 ZIP”“从 Git 导入”“检查更新”；
- 不使用“Marketplace 已安装”等容易误导的文案。

### 16.2 Revision 审核

- 文件树和纯文本查看器，不执行 HTML/Markdown 中的脚本；
- 第一个 revision 显示全量内容，后续默认显示与上一个 published revision 的 diff；
- scripts 独立高亮，展示 shebang、外部 URL、依赖和扫描告警；
- 展示 commit SHA、artifact SHA-256、导入人、审核人和状态时间线；
- 发布/拒绝按钮遵守双人审核和 MFA。

### 16.3 码多多 Skill 配置

- 左侧为全部 `published` revision，右侧为候选集合；
- 明确展示当前 `activation_version` 和运行中集合；
- 激活前显示新增、升级、降级和移除 diff；
- 激活失败保留旧集合并显示稳定错误码；
- 历史集合可一键“按此内容创建并激活新集合”，不倒改历史行。

## 17. 部署、网络与密钥

新增服务/网络：

- `skill-registry-migrate`：只运行 schema migration；
- `skill-registry`：私有 API + 持久 job 轮询器；
- `git-egress-proxy`：只允许部署清单内的 Git Provider HTTPS 主机；
- `git_fetch`：Registry 到 proxy 的内部网络；
- `git_egress`：只有 proxy 连接的外网网络。

Web 仍只有 `frontend + backend`；Agent 仍只有 `backend + model_egress`；Registry 不连接 `model_egress`，Agent 不连接 `git_egress`。应用层 Provider adapter、主机允许列表、DNS/IP 拒绝规则和 proxy allowlist 必须同时存在。

新增数据库角色：

- `ai_agent_skill_registry_migrator`：拥有 schema/DDL；
- `ai_agent_skill_registry_manager`：Registry 最小 CRUD 权限；
- `ai_agent_skill_registry_runtime`：Agent 只读 published revision/artifact/set，并只可 CAS 更新活动指针、集合状态和写控制事件；
- `ai_agent_backup`：增加 `skill_registry` 只读权限。

新增 Secret：

- `SKILL_REGISTRY_MIGRATOR_DATABASE_URL`；
- `SKILL_REGISTRY_DATABASE_URL`；
- `SKILL_REGISTRY_RUNTIME_DATABASE_URL`；
- `SKILL_SOURCE_ENCRYPTION_KEY`；
- `SKILL_REGISTRY_CONTROL_KEY`；
- 可选 Provider OAuth/GitHub App Secret。

这些 Secret 不复用现有 `OS_SECURITY_KEY`、`AGENT_CONFIG_CONTROL_KEY`、模型配置密钥、认证密钥或备份密钥。

## 18. 备份与恢复

现有备份命令必须新增 `--schema=skill_registry`，并给 `ai_agent_backup` 相应 SELECT 权限。这样 Skill 元数据、canonical ZIP、来源、审核和活动集合进入同一个加密 custom-format 备份。

恢复验收至少验证：

1. Skill/revision/artifact/set 行数与备份前一致；
2. 所有 artifact SHA-256 可重新计算且一致；
3. 活动集合只引用存在的 `published` revision；
4. Provider 凭据密文存在，但没有 `SKILL_SOURCE_ENCRYPTION_KEY` 时不可解密；
5. 恢复部署补齐正确加密 Key 后，Agent 能在 readiness 前恢复活动集合；
6. 备份日志、dump 列表和验收输出不打印制品正文或凭据。

与 `agent_control` 的现有策略不同，`skill_registry` 不能排除在备份外：第三方仓库可能删除或变化，审核过的精确制品无法可靠重建。

## 19. 可观察性与错误合同

稳定状态：

- import job：`queued | running | succeeded | failed | cancelled`；
- runtime capability：`unconfigured | ready | activating | degraded`；
- revision：`pending_review | published | rejected | archived`；
- skill set：`candidate | active | superseded | failed`。

稳定错误类别至少包括：

- `ARCHIVE_TOO_LARGE`、`ARCHIVE_UNSAFE_PATH`、`ARCHIVE_UNSUPPORTED_FILE`；
- `SKILL_SCHEMA_INVALID`、`SKILL_NAME_CONFLICT`、`SKILL_DEPENDENCY_UNAVAILABLE`；
- `SOURCE_AUTH_FAILED`、`SOURCE_NOT_FOUND`、`SOURCE_REF_NOT_FOUND`；
- `SOURCE_HOST_DENIED`、`SOURCE_RATE_LIMITED`、`SOURCE_DOWNLOAD_FAILED`；
- `REVIEW_SELF_APPROVAL_DENIED`、`REVISION_NOT_PUBLISHED`；
- `ARTIFACT_DIGEST_MISMATCH`、`SKILL_LOAD_FAILED`；
- `ACTIVATION_VERSION_CONFLICT`、`ACTIVATION_DRAIN_TIMEOUT`。

日志和指标记录 Provider、job/revision/set ID、commit SHA、摘要前缀、耗时、大小、状态和错误类别；不记录 Token、Authorization header、文件正文、脚本输出或完整用户路径。

## 20. 测试与验收

### 20.1 单元/合同测试

- ZIP traversal、symlink、hardlink、zip bomb、重复路径、nested archive；
- canonical ZIP 和 SHA-256 的确定性；
- Agno frontmatter/name/description 校验与目录名一致性；
- 同名 Skill、重复 revision、状态机和双人审核；
- Provider URL 构造、ref 到 commit 解析、redirect/SSRF 拒绝；
- Token 加密、错误脱敏、无 Token URL/日志；
- artifact store PostgreSQL 实现和未来接口合同；
- candidate set、CAS、空集合、回滚和活动 revision 归档保护；
- Agno 构造成功但少加载/覆盖时的集合等值失败；
- 激活期间并发 run 的 generation 租约。

### 20.2 PostgreSQL 集成测试

- migration、最小角色权限和 RLS/约束（若采用）；
- revision + files + artifact 原子写入；
- `FOR UPDATE SKIP LOCKED` job 领取和崩溃重试；
- `activation_version` 并发冲突；
- manager/runtime/backup 角色不能越权。

缺少测试数据库时只能标为 skipped，不能算通过。

### 20.3 Web/Agent 集成测试

- 浏览器上传后只得到 `pending_review`；
- 创建者自审返回 403；另一审核人 MFA 后发布；
- 未发布 revision 无法绑定；
- 候选全量加载成功后新 run 能看到三项 Agno Skill 工具；
- 脚本 Skill 能在专用 executable tmpfs 执行 Python/sh；
- 候选包含损坏制品时旧集合继续服务；
- Agent 重启后从活动指针恢复同一摘要；
- 活动制品缺失/损坏时 readiness 503，不静默无 Skill 启动；
- Web、Agent、Registry 的错误响应和日志不泄漏源码、Token 或 Secret。

### 20.4 Docker 验收

- Web 无 Git 外网，Agent 无 Git 凭据，Registry 不能直连外网，只有 proxy 可出站；
- proxy 拒绝未允许域名、HTTP、私网 IP、跨主机 redirect；
- Agent 根文件系统只读，`/tmp` noexec，只有 `/run/aap-skills` 可执行；
- Agent 非 root、cap drop、`no-new-privileges`、CPU/内存/PID 限制保持；
- 加密备份包含 `skill_registry`，恢复后摘要与活动集合一致；
- 验收结束无临时容器、网络、卷和明文制品残留。

## 21. 分阶段交付

### 阶段 A：Registry 基础和 ZIP 上传

- schema、角色、迁移、artifact store；
- 包验证/canonicalize/扫描；
- Admin 上传、revision 浏览和双人审核；
- 备份/恢复合同。

此阶段不挂 Agent，先把“可追溯的审核制品”做实。

### 阶段 B：码多多加载和激活

- runtime 只读视图、专用 executable tmpfs；
- Agno LocalSkills 候选加载和等值校验；
- generation 租约、CAS 激活、启动恢复和降级；
- 后台绑定、激活和回滚。

### 阶段 C：Git Provider 导入

- Registry 持久 job worker 和导入状态接口；
- Git egress proxy；
- GitHub/GitLab/GitCode adapters；
- Provider connection、凭据加密、检查更新和重新导入。

### 阶段 D：运行安全增强（后续独立决策）

- 独立 script executor；
- 默认无网络、精细环境白名单、强制资源/输出上限；
- 更强静态/依赖/恶意内容扫描；
- 根据规模迁移 S3/MinIO。

## 22. 完成定义

只有同时满足以下条件，才能把后台 Skill 能力标为“已接入”：

1. ZIP 和三类 Git Provider 都生成平台内部不可变 revision；
2. 未审核、自审、已拒绝和已归档 revision 都无法进入候选集合；
3. 码多多只加载当前活动集合中的精确 published revision；
4. 激活失败、Agent 重启和制品损坏的行为符合失败关闭合同；
5. 脚本执行风险在审核页和运维文档中明确展示；
6. 权限、MFA、双人审核、审计和 Token 加密通过负向测试；
7. `skill_registry` 通过真实 PostgreSQL 备份/恢复和摘要验收；
8. Docker 网络、只读文件系统和临时目录验收通过；
9. 现有单 Agent、动态模型、会话和 Web 测试无回归；
10. 管理后台不再用占位状态冒充真实 Skill 能力。

## 23. 外部接口依据

- [GitHub App installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)：短期、仓库和权限受限，适合私有仓库读取；
- [GitHub repository contents/archive API](https://docs.github.com/en/rest/repos/contents) 与[固定 commit 的 source archive](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)：固定 commit 下载可避免 branch 漂移；
- [GitLab repository archive API](https://docs.gitlab.com/api/repositories/)：支持 `sha` 和 `path`；
- [GitLab OAuth](https://docs.gitlab.com/api/oauth2/)、[project access token](https://docs.gitlab.com/user/project/settings/project_access_tokens/) 与 [token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/)：用于受限私有仓库访问；
- [GitCode API v5](https://docs.gitcode.com/v1-docs/en/docs/repos/)：使用 repository tree 和 raw file 接口实现受限路径导入；
- [GitCode OAuth](https://docs.gitcode.com/docs/apis/oauth/)：用于私有仓库授权。

实现时必须以锁定 Provider API 版本的官方文档和合同测试为准；任何 Provider 能力缺失都应返回明确“不支持”，不能退回任意 URL 或 shell `git clone`。
