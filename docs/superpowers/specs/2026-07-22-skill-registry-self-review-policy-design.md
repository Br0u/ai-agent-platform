# Skill Registry 权限自审与 ZIP 诊断提示设计

> 日期：2026-07-22
> 状态：待用户审阅
> 变更基础：`2026-07-20-maduoduo-skill-registry-design.md`

## 1. 背景

现有 Skill Registry 将“拥有审核权限”和“审核人与上传者必须不同”同时作为发布条件。产品规则现调整为：上传者只要拥有审核权限，即可审核自己上传的 revision；审核操作仍要求有效员工会话、`admin:assistant:skills:review` 权限，以及近期密码和 MFA 认证。

当前第四项审核声明为“确认审核人与创建者相互独立”，与新规则冲突。该声明及其 API、数据库字段需要完整迁移，不能只修改页面文案。

本次排查还确认，两份看似目录内容相同的 Skill 包具有不同 ZIP 根结构：失败包同时包含带时间戳的 Skill 根目录和 Finder 生成的 `__MACOSX/`，因此被单根目录合同以 `ARCHIVE_MULTIPLE_SKILL_ROOTS` 拒绝；通过包只有与 `SKILL.md` 名称一致的 `ai-system-knowledge/` 根目录。

## 2. 已确认规则

1. 上传者可以审核自己的 revision。
2. 审核账号必须拥有 `admin:assistant:skills:review` 权限。
3. 审核继续要求近期密码和 MFA，不因允许自审而降低认证强度。
4. 发布与拒绝仍要求四项审核声明全部为 `true`。
5. 第四项声明改为“确认审核账号具备审核权限并对本次发布负责”。
6. 阻断 Finding、状态机、审核事件绑定、防重放和不可变制品规则保持不变。
7. ZIP 必须只有一个 Skill 根目录；不自动忽略 `__MACOSX` 或其他额外根目录。

## 3. 方案选择

采用完整语义迁移，不保留名称错误的 `independentReviewerConfirmed`：

- TypeScript/JSON：`reviewerAuthorizationConfirmed`；
- Python：`reviewer_authorization_confirmed`；
- PostgreSQL：`reviewer_authorization_confirmed`。

不采用以下方案：

- 只移除前端限制：数据库触发器仍会拒绝自审；
- 允许自审但保留旧字段名：审计数据会继续表达不真实的“独立审核”；
- 删除第四项声明：会降低当前审核责任确认的完整性。

历史值可安全迁移：旧值为 `true` 表示当时审核人独立，而独立审核人也必然是获得审核授权的账号，因此列重命名不会伪造更强的历史事实。

## 4. 授权与数据流

### 4.1 上传

上传流程保持：

```text
员工会话 + upload 权限 + 近期认证
  -> Web Admin BFF
  -> Skill Registry 校验并规范化 ZIP
  -> pending_review
```

上传成功提示由“等待独立审核”改为“等待有审核权限的账号审核”。

### 4.2 审核

```text
员工会话
  -> Web 检查 admin:assistant:skills:review
  -> 检查近期密码 + MFA
  -> 四项声明全部确认
  -> Registry 写入 review control event
  -> 同一事务更新 revision 状态
```

`reviewed_by` 可以等于 `created_by`。Web 权限检查是用户级授权边界；Registry 继续校验受信任的 Web 断言、控制事件 actor、目标 revision、预期状态和 nonce。数据库继续要求控制事件 actor 与 `reviewed_by` 一致，并防止事件复用。

### 4.3 状态变化

状态机不变：

- `pending_review -> published`；
- `pending_review -> rejected`；
- `published -> archived`。

有阻断 Finding 时不能发布，只能拒绝。拒绝原因仍为必填。已完成审核的 revision 不允许重新审核或修改审核元数据。

## 5. 组件修改

### 5.1 Web UI

- 删除详情页和审核弹窗中的 `createdBy === actorUserId` 禁止逻辑；
- 上传者拥有审核权限时可看到并打开“审核操作”；
- 第四项复选框改为新的授权与责任声明；
- 删除“需独立审核人”“创建者不能批准或拒绝”等文案；
- 上传成功文案不再承诺独立审核；
- Findings、文件查看、Diff 和拒绝原因交互保持不变。

### 5.2 Web BFF 与内部合同

- 将所有审核命令和详情 DTO 中的字段改为 `reviewerAuthorizationConfirmed`；
- 继续严格拒绝多余字段、缺失字段和非布尔 `true`；
- 审核路由继续要求 `admin:assistant:skills:review` 和近期密码/MFA；
- 不新增“创建者例外”或隐式超级管理员绕过；权限判断统一走现有授权服务；
- 携带审核声明的详情响应升级为合同版本 `2`，不携带该字段的列表、上传和文件响应保持版本 `1`。

### 5.3 Skill Registry

- `ReviewAttestations` 改用 `reviewer_authorization_confirmed`；
- API 请求严格接收新的 JSON 字段；
- Repository 写入新的控制事件列；
- Service 继续要求四项声明完整；
- 删除“reviewer 与 creator 必须不同”的业务判断，其他状态竞争和幂等保护不变。

### 5.4 PostgreSQL schema v2

新增 schema version 2 迁移：

1. 将 `skill_control_events.independent_reviewer_confirmed` 重命名为 `reviewer_authorization_confirmed`；
2. 重建 `skill_control_events_review_evidence` 约束，审核事件要求新列为 `TRUE`，非审核事件要求其为 `NULL`；
3. 替换 revision 更新触发器，删除 `NEW.reviewed_by = OLD.created_by` 拒绝分支；
4. 保留 reviewer/时间必填、事件 actor 匹配、同事务绑定、nonce 唯一和非法状态转换拒绝；
5. 更新 schema verifier，拒绝高于支持版本的数据库，并验证旧列不存在、新列类型与约束正确。

迁移只改变列名、约束和触发器，不改 revision、制品、审核 actor、时间或历史布尔值。

## 6. ZIP 校验与错误提示

单根目录合同不放宽。服务端不能静默丢弃 `__MACOSX`，因为“自动忽略额外根目录”会让攻击者把未审核内容藏在被忽略路径中，也会造成用户上传内容与平台保存内容不一致。

Web 对 `validation_error` 增加安全、固定的操作提示：

> ZIP 校验失败。请确保压缩包只有一个顶层 Skill 目录，删除 `__MACOSX`，并确保顶层目录名与 `SKILL.md` 的 `name` 一致。

不返回原始异常、绝对路径或压缩包内容。平台不在浏览器重复实现 ZIP 解析；最终判定仍由共享 `skill-core` 完成。

推荐的打包方式是在待打包目录的父目录执行显式 ZIP 命令，并排除 Finder 元数据；Finder 的“压缩”不能作为受支持的标准打包流程。

## 7. 错误处理

- 权限不足：保持现有 403，不向 Registry 发起审核命令；
- 近期密码或 MFA 不满足：保持现有重新认证流程；
- 声明不完整或字段错误：返回固定 validation error，revision 保持 `pending_review`；
- 阻断 Finding：禁止批准，允许填写原因后拒绝；
- 并发审核：只有第一个满足 `expectedState=pending_review` 的事务成功；
- Registry、数据库或控制事件失败：事务回滚，旧状态保留；
- ZIP 结构失败：不创建 Skill/revision/artifact，显示固定修复提示。

## 8. 测试策略

实施按 TDD 进行，每个行为先观察失败再写生产代码。

### 8.1 Web

- 上传者拥有审核权限时可以打开审核弹窗并提交批准；
- 新第四项声明未勾选时按钮禁用，勾选后可提交；
- 请求体只包含 `reviewerAuthorizationConfirmed: true`，旧字段被拒绝；
- 无审核权限、近期密码或 MFA 时仍被拒绝；
- 上传校验失败时显示单根目录、`__MACOSX` 和名称一致性提示。

### 8.2 Registry

- creator 与 reviewer 相同且四项声明完整时允许发布；
- 缺失、`false`、truthy 非布尔值或旧字段时拒绝；
- 阻断 Finding、错误 expected state、错误 actor、错误目标和重放 nonce 继续拒绝；
- 详情响应只返回新字段并使用合同版本 2。

### 8.3 PostgreSQL

- 从 schema v1 迁移到 v2 后历史审核事件数据保持不变；
- 同一 actor 创建并审核 revision 的合法事务通过；
- 没有匹配控制事件、事件 actor 不同、事件复用或声明不完整仍失败；
- 新建空库与有状态升级后的 schema verifier 都通过；
- manager/runtime/backup 角色边界不扩大。

### 8.4 原始问题回归

使用真实的两份 ZIP 运行共享校验器：

- `ai-system-knowledge-20260703.072701 2.zip` 必须稳定返回 `ARCHIVE_MULTIPLE_SKILL_ROOTS`；
- `ai-system-knowledge-validated.zip` 必须稳定通过并得到 slug `ai-system-knowledge`；
- 两者差异明确归因于 ZIP 根条目，而不是解压后业务文件内容。

## 9. 验收标准

1. 当前上传账号拥有审核权限并完成近期密码/MFA 后，可以审核自己的 pending revision。
2. 审核完成后状态正确变为 `published` 或 `rejected`，控制事件与 actor 可追溯。
3. 旧“独立审核”字段、文案和数据库约束不再出现在生产路径。
4. 权限、近期认证、Findings、状态机、事件事务绑定和防重放没有被弱化。
5. schema v1 到 v2 的真实 PostgreSQL 有状态迁移通过，空库启动通过。
6. 失败 ZIP 获得可执行的固定提示，成功 ZIP 继续通过。
7. Web、Registry、数据库契约测试、类型检查、lint、构建和真实 Compose 冒烟验证全部通过。

## 10. 非目标

- 不实现 Agent 运行时 Skill 加载或激活；
- 不允许没有审核权限的上传者自审；
- 不取消近期密码/MFA；
- 不自动清洗、改名或重新打包用户上传的失败 ZIP；
- 不放宽单根目录、路径、大小、文件类型或 canonical ZIP 安全合同。
