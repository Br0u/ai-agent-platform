# AI 助理后台动态模型配置设计规格

> 日期：2026-07-17
> 状态：已确认（实现审查已补充不可变 revision 恢复约束）
> 前置规格：`docs/superpowers/specs/2026-07-16-maduoduo-single-agent-loop-design.md`

## 1. 背景

前一阶段已经完成唯一 Agent“码多多”的真实调用闭环：

```text
Browser -> Next.js BFF -> AgentOS -> 码多多 -> Agno Model Adapter
```

现有实现已覆盖 OpenAI、Anthropic Claude、Google Gemini、Qwen/DashScope、DeepSeek 和 MiniMax，并具备匿名多轮会话、内部认证、限流、熔断、超时、错误脱敏、模型出口网络和确定性容器验收。模型配置仍来自 Agent 启动环境和 Docker Secret；切换 Provider、模型或 Key 需要修改部署配置并重启 Agent。

本阶段直接扩展现有闭环，在已有 `/admin/assistant`“AI 助理”页面加入可用的模型配置控制面。管理员保存并成功测试新配置后，码多多无需重启即可使用新模型。本阶段不是新的 Agent 实现，也不建立另一套后台。

项目锁定 Agno `2.7.2`。设计参考 Agno 官方 Agent、Model、AgentOS、Skills、Knowledge 和 Tools 边界；实现必须以本地锁定版本的实际 API 和测试结果为准，不能假设最新版文档接口已存在于 `2.7.2`。

## 2. 目标

1. 在现有 `/admin/assistant` 页面管理六个已支持云模型供应商的配置。
2. 每个供应商保留一份配置，任意时刻只启用一个模型。
3. 保存后由 Agent 加密 Key；数据库、列表接口和服务端渲染不得出现明文。
4. “测试并启用”必须先验证候选模型，成功后原子切换；失败时旧模型继续服务。
5. 切换 Provider、模型和 Key 不修改 `.env`，不重启 Web 或 Agent。
6. 为配置、Key 查看、测试和启用建立独立权限、二次验证和审计。
7. 超级管理员可按授权临时查看已保存 Key 明文，30 秒后自动隐藏。
8. 保留 Agno Skill、Knowledge、Tools/网页操作和本地算力的真实扩展入口，但不伪造已接入能力。
9. 复用现有 Provider Registry、AgentOS BFF、会话、安全、熔断、超时、脱敏和 E2E 基础设施。

## 3. 非目标

本阶段不包含：

- 多 Agent、Team、Workflow 或模型自动路由；
- 多模型同时启用、负载均衡、跨 Provider 自动故障转移；
- 供应商模型列表自动发现、计费、额度或成本统计；
- Skill 的扫描、加载、启停、上传、编辑、删除或脚本执行；
- Knowledge 的文档、网页、文件上传或向量检索；
- Tools、浏览器操作、网页正文读取或 MCP 接入；
- 本地模型仓库、Ollama、vLLM 或 OpenAI-compatible 本地服务的真实连接；
- 任意 Base URL 输入；
- 密钥轮换编排、外部 KMS、Vault 或多 AgentOS 实例协调；
- 管理员查看普通用户会话原文；
- 把 API Key 放入 URL、浏览器存储、服务端 HTML、日志、追踪或错误响应。

## 4. 已确认决策

| 主题 | 决策 |
| --- | --- |
| 页面位置 | 复用现有 `/admin/assistant` 和“AI 助理”导航 |
| 配置所有者 | Agent 自有配置控制面；Web 负责用户鉴权、BFF 和审计 |
| Provider | OpenAI、Claude、Gemini、Qwen、DeepSeek、MiniMax |
| 配置数量 | 每个 Provider 一个当前可编辑配置头；持久层保留不可变 revision，任意时刻一个活动 revision |
| 生效方式 | 测试成功后热切换，无需服务重启 |
| 失败策略 | 当前模型不变，不自动切换其他 Provider |
| Key 存储 | Agent 使用认证加密后持久化 |
| Key 默认展示 | 脱敏并显示末四位 |
| Key 明文查看 | 独立权限 + 最近 10 分钟密码/TOTP 验证；显示 30 秒 |
| Base URL | 官方地址或部署允许列表中的 Endpoint ID；后台不可自由输入 |
| Skill | 保留入口和“未接入”状态，本期不加载 |
| 本地算力 | 独立预留入口，本期不可配置或启用 |
| 部署总开关 | 继续保留，后台不可绕过 |

## 5. 复用与新增边界

### 5.1 直接复用

- `apps/agent/src/agent_service/default_agent.py`：固定 Agent ID `maduoduo` 和系统指令。
- `apps/agent/src/agent_service/model_registry.py`：六家 Agno Provider 工厂、超时和 SDK 禁重试设置。
- `apps/agent/src/agent_service/provider_smoke.py`：安全验证语义和固定错误类别；可抽取共享验证服务，CLI 继续复用。
- `apps/agent/src/agent_service/runtime_logging.py`：Agno/Provider 原始错误日志脱敏。
- `apps/web/src/server/assistant/*`：AgentOS 私有传输、run/session、就绪探测和执行熔断。
- `apps/web/src/app/api/v1/admin/assistant/*`：Admin 权限边界、状态、测试控制台和版本化响应合同。
- `apps/web/src/server/auth/sensitive-action.ts`：最近密码/TOTP 验证。
- Compose Secret、内部 Bearer、模型出口网络、PostgreSQL 就绪和容器验收脚本。

### 5.2 新增

- Agent 控制面配置存储与迁移。
- 固定 Agent 内部的可热切换模型槽。
- Agent 内部模型配置 API 和独立服务凭据。
- Web Admin 模型配置 BFF API 与类型合同。
- `/admin/assistant` 页面内的模型配置组件。
- 配置和查看 Key 的独立权限与审计事件。
- 动态配置确定性 E2E。

现有闭环不会复制或替换。`default_agent.py` 仍只构建一个码多多；区别是模型从启动时固定实例改为稳定的运行时模型槽。

## 6. 页面与交互

### 6.1 页面结构

`/admin/assistant` 保持一个页面，按以下顺序展示：

1. 现有 AgentOS、数据库、模型和公开入口状态卡片；
2. 云模型配置区；
3. 独立“本地算力”预留卡片；
4. Agno Skill、Knowledge、Tools/网页操作预留卡片；
5. 现有受保护测试控制台；
6. 现有会话持久化状态。

不新增顶级导航，不创建第二个“AI 助理配置”产品。

### 6.2 云模型配置区

左侧展示六个 Provider：

- 显示名称；
- `未配置 | 已配置 | 测试失败 | 已启用` 状态；
- 活动 Provider 标识；
- 最近测试时间。

右侧编辑当前 Provider：

- Provider：只读；
- Model ID：受限非空字符串；
- API Key：新建或替换时填写；
- Endpoint：官方默认或部署允许列表选项；
- 当前配置版本；
- “保存草稿”和“测试并启用”。

页面不得把“已保存”解释为“可用”；只有成功测试并成为活动版本才显示“已启用”。

### 6.3 Key 查看

默认只显示“已配置”、末四位和更新时间。拥有 `admin:assistant:secret:reveal` 的用户可点击“查看”：

1. 服务端要求最近 10 分钟内完成密码 + TOTP 二次验证；否则跳转现有 `/staff/re-auth`。
2. Web 使用 POST 请求调用专用 reveal API；明文不得通过 GET、查询参数或服务端渲染返回。
3. 明文只保存在当前组件内存状态，显示 30 秒。
4. 倒计时结束、手动隐藏、切换 Provider、刷新、`pagehide`、`visibilitychange` 或组件卸载时立即清空。
5. 明文响应必须 `Cache-Control: no-store`，并禁止被应用日志、埋点、错误边界或开发诊断捕获。
6. 每次成功或失败查看都写审计；审计不得包含 Key。

页面可提供复制按钮。浏览器无法可靠撤回已写入系统剪贴板的内容，因此复制前必须提示“复制后由操作系统剪贴板负责保管”；不得声称 30 秒后能清除外部剪贴板。

### 6.4 权限展示

- 只有 `admin:assistant`：可查看脱敏状态并使用现有测试控制台。
- 有 `admin:assistant:configure`：可保存、替换 Key、测试和启用配置。
- 有 `admin:assistant:secret:reveal`：可在二次验证后查看已保存 Key。

无权限时不只依赖禁用按钮；服务端必须独立拒绝请求。页面可以隐藏危险动作，但不能把客户端状态作为授权依据。

## 7. 总体架构

```text
Browser /admin/assistant
  -> Web Admin BFF
     - workforce session
     - exact permission check
     - recent password + TOTP assurance
     - audit metadata
  -> private Agent control API
     - dedicated service credential
     - validation and endpoint allowlist
     - Provider verification
     - AES-256-GCM encryption/decryption
     - durable agent_control storage
     - runtime model slot activation
  -> 码多多 / AgentOS
     - stable Agent instance
     - active model slot
  -> configured Provider
```

浏览器仍不直接连接 AgentOS。Agent 控制 API 与 AgentOS 使用同一容器和私有网络，但使用独立认证凭据及独立路径策略。Agent 继续不向宿主机发布端口。

## 8. Agent 配置控制面

### 8.1 运行配置

新增部署级配置：

- `AGENT_CONTROL_MIGRATOR_DATABASE_URL`：只用于创建和迁移 `agent_control` schema；
- `AGENT_CONTROL_DATABASE_URL`：Agent 控制面最小权限 runtime 角色；
- `MODEL_CONFIG_ENCRYPTION_KEY`：只挂载 Agent 的 32 字节加密密钥；
- `AGENT_CONFIG_CONTROL_KEY`：Web 与 Agent 共享的独立内部调用凭据；
- `MODEL_ENDPOINTS_FILE`：只读 Endpoint 允许列表文件。

`MODEL_CONFIG_ENCRYPTION_KEY` 不得挂载到 Web。`AGENT_CONFIG_CONTROL_KEY` 不得与 `OS_SECURITY_KEY`、会话密钥、认证密钥或数据库密码复用。

现有 `AGENT_ENABLED` 与 `ASSISTANT_PROVIDER` 继续作为部署级紧急总开关：

- 关闭时页面保持可观察但配置操作只读；
- 后台无权修改或绕过；
- `AGENT_ENABLED=true` 表示注册可配置的码多多和启用控制面，不再要求启动环境必须同时提供 Provider、Model ID 和模型 Key；
- `ASSISTANT_PROVIDER=agentos` 时，Web 根据 AgentOS 动态 capability 决定调用真实 Agent 或返回安全占位；
- 开启控制面后，Provider、Model ID、Endpoint 和 Key 的日常切换无需再修改环境或重启。

### 8.2 启动兼容

现有环境/Secret 模型配置保留为只读 bootstrap 来源：

- 数据库没有活动动态配置且环境配置有效时，继续使用现有模型；
- 页面标记来源为“部署配置”，不得声称由后台管理；
- bootstrap Key 不通过 Admin reveal API 回显；
- 第一次成功激活动态配置后，数据库活动版本优先；
- 动态活动配置存在但无法解密或构建时，状态必须降级并失败关闭，不能静默回退到另一个 Provider。

这保证前一阶段部署继续可用，同时避免自动复制或暴露原有 Docker Secret。

### 8.3 稳定 Agent 与模型槽

`AGENT_ENABLED=true` 时，码多多始终以固定 ID 注册到 AgentOS；总开关关闭时保持现有安全占位行为。新增 `ModelRuntimeSlot`：

- 对外满足 Agno `Model` 调用边界；
- 内部保存当前 Provider model delegate 和配置 revision；
- 每次新 run 捕获一次当前 delegate；
- 已开始的 run 使用旧 delegate 完成；
- 激活完成后的新 run 使用新 delegate；
- 无可用模型时返回明确的 unavailable，不执行网络请求。

切换只更新模型槽，不重新创建 AgentOS、Agent、database 或会话存储。当前部署为单 AgentOS 进程；多实例同步不在本阶段范围内。

## 9. 数据模型

在同一 PostgreSQL 实例新增 `agent_control` schema，由独立 migrator 创建；Agent control runtime 只拥有所需表的最小 `SELECT/INSERT/UPDATE` 权限。

### 9.1 `agent_control.model_configs`

每次保存生成一行不可变 revision；每个云 Provider 通过部分唯一约束最多只有一个 `current` 配置头。后台仍只展示这个当前头，不把历史 revision 暴露为多份可编辑配置。被活动指针引用的旧 revision 必须保留，确保保存新草稿、测试失败或 Agent 重启后仍能恢复旧模型：

| 字段 | 含义 |
| --- | --- |
| `id` | UUID 主键 |
| `provider` | 六个允许值之一，唯一 |
| `model_id` | 受限模型 ID |
| `endpoint_id` | 允许列表中的稳定 ID，不存管理员自由输入 URL |
| `api_key_ciphertext` | AES-GCM 密文和认证标签 |
| `api_key_nonce` | 每次加密随机生成的 96-bit nonce |
| `api_key_last_four` | 仅用于脱敏展示 |
| `encryption_key_version` | 加密密钥版本，首版固定为 `1` |
| `revision` | 单调递增乐观锁版本 |
| `is_current` | 当前可编辑头；每个 Provider 最多一个 `true` |
| `test_status` | `untested | passed | failed` |
| `last_tested_at` | 最近测试时间 |
| `created_at` / `updated_at` | 审计时间戳 |

`(provider, revision)` 唯一。保存新草稿时，在同一事务内把旧头标为非 current、插入新 revision 并写 control event。若未提交新 Key，Agent 必须先解密旧 Key，再使用新配置 ID、新 revision 和新随机 nonce 重新加密；不得复用绑定旧 AAD 的密文。

不存原始响应、测试提示、模型回答、完整 Endpoint、明文 Key 或用户会话内容。历史 revision 的清理不在本阶段范围内；活动指针引用的 revision 禁止删除。

### 9.2 `agent_control.active_model_config`

单例行保存：

- 当前 `model_config_id`；
- 激活时对应的 `config_revision`；
- `activated_at`；
- 单调递增的活动版本。

配置 revision 和活动指针在同一数据库事务内更新，确保数据库只有一个活动 revision。活动指针引用精确不可变行；当前 Provider 后续保存新草稿不得改变该引用。

### 9.3 `agent_control.control_events`

Agent 控制面维护追加式安全事件，至少包含：

- request ID 和一次性 assertion nonce；
- actor ID、动作、Provider、Model ID、Endpoint ID 和 revision；
- 固定结果类别与时间戳。

配置写入、测试状态、活动指针和对应 control event 在同一数据库事务内提交。Reveal 必须先提交不含秘密的成功/失败 control event，再允许内部 API 返回明文。该表是跨服务操作结果的权威审计；Web 同时镜像到现有平台审计日志，便于后台统一查询。两层审计都不得包含 Key、末四位、密文、nonce、完整 URL、提示词、模型响应或供应商错误体。

### 9.4 加密

Agent 使用 AES-256-GCM：

- 每次写入生成新 nonce；
- AAD 绑定配置 ID、Provider、revision 和加密密钥版本；
- 认证失败、未知密钥版本或不合法密文必须失败关闭；
- 明文只在请求处理和模型构造的最小生命周期内存在；
- Key 不进入异常字符串、repr、指标标签或 trace attribute。

首版不实现在线主密钥轮换，但预留 `encryption_key_version`。替换部署加密密钥前必须先提供未来迁移工具；禁止直接替换后让旧配置静默失效。

## 10. Endpoint 允许列表

管理员不能自由输入 Base URL。Agent 从只读部署文件加载稳定 Endpoint：

```text
endpoint_id -> provider, label, normalized base_url, enabled
```

规则：

- 六家官方地址内置稳定 ID；
- 自定义云地址只能由部署操作员加入允许列表；
- 必须使用 HTTPS，不允许 userinfo、query、fragment、重定向或通配主机；
- Provider 与 Endpoint 类型必须匹配；
- Agent 请求仍拒绝重定向；
- Admin API 只接受 `endpoint_id`，不能提交 URL；
- 当前不允许 localhost、链路本地、私网 IP 或本地域名。

未来“本地算力”使用独立策略和网络边界，不通过放宽云 Endpoint 校验实现。

## 11. API 合同

### 11.1 Web Admin BFF

新增版本化路由：

- `GET /api/v1/admin/assistant/model-configs`：返回六个 Provider 的脱敏元数据、活动配置、Endpoint 选项和当前用户能力；
- `PUT /api/v1/admin/assistant/model-configs/{provider}`：保存草稿；首次配置或替换 Key 时提交完整新 Key；
- `POST /api/v1/admin/assistant/model-configs/{provider}/test-and-activate`：测试指定 revision 并激活；
- `POST /api/v1/admin/assistant/model-configs/{provider}/reveal-key`：二次验证后单次返回明文；
- `GET /api/v1/admin/assistant/status`：扩展为返回动态来源、Provider、Model ID、revision 和测试状态，不返回 Key。

所有 mutation 必须：

- 只接受同源请求并执行现有 CSRF/Origin 防护；
- 使用独立权限；
- 需要最近 10 分钟密码/TOTP assurance；
- 使用有界请求体、严格 content type 和版本化 JSON；
- 设置 `Cache-Control: no-store`；
- 使用 request ID 关联脱敏审计；
- 对过期 revision 返回 `409 configuration_conflict`。

### 11.2 Agent 内部控制 API

新增 `/internal/control/model-configs/*` 路由，仅接受 `AGENT_CONFIG_CONTROL_KEY`：

- 列出脱敏配置；
- 保存并加密草稿；
- 验证并激活 revision；
- 解密并单次返回 Key；
- 返回动态 runtime 状态。

内部凭据和 AgentOS `OS_SECURITY_KEY` 分离。中间件必须在读取请求体前验证凭据；配置路由不得产生 access log body。Web 对危险动作生成短生命周期、一次性 request assertion，包含 actor、权限、request ID、过期时间和 nonce；Agent 在配置事务内拒绝过期或重复 nonce，降低跨服务授权重放风险。

## 12. 保存、测试与激活

### 12.1 保存草稿

1. Web 验证 workforce session、`admin:assistant:configure` 和最近 MFA。
2. Web 验证请求合同，但不记录 Key。
3. Agent 校验 Provider、Model ID、Endpoint ID 和 Key 格式。
4. 新 Key 使用 AES-GCM 加密；未提交新 Key 时解密当前头的 Key，并使用新配置 ID、revision 和随机 nonce 重新加密，不复用旧 AAD 密文。
5. 使用客户端 revision 执行 compare-and-swap；过期返回 409。
6. 保存、状态变化和脱敏 control event 在同一事务提交；保存后状态为 `untested`，活动模型不变。
7. Web 镜像脱敏平台审计；Agent control event 仍是远端写入结果的权威记录。

### 12.2 测试并启用

1. 对指定 revision 获取并解密候选配置。
2. 复用 `model_registry.py` 构造候选 Agno model。
3. 复用 provider smoke 的安全验证服务执行一次最小请求：无 Tool、无 Skill、无 Knowledge、无会话持久化、无 SDK 自动重试，最大 50 秒。
4. 丢弃模型正文，只判断协议成功和非空有效响应。
5. 测试失败时把该 revision 标记为 `failed`，不修改活动指针或模型槽。
6. 测试成功后，在 Agent 激活锁内更新活动指针并提交事务，再用同一已验证 model 实例替换模型槽。
7. 若数据库提交后进程在内存切换前退出，重启时从活动指针恢复新配置；旧进程不会继续服务。
8. 返回成功后，新 run 使用新模型，已在执行的 run 保持旧模型。

不实现自动回退或跨 Provider 重试。Provider 运行故障继续由现有执行熔断表示。

## 13. Key reveal 流程

1. Web 要求 `admin:assistant:secret:reveal`。
2. Web 使用现有 `requireSensitiveWorkforceAction()` 要求最近 10 分钟密码和 TOTP。
3. Web 平台审计不可写时失败关闭，不调用 Agent 解密。
4. Agent 验证一次性 assertion、配置 revision 和内部凭据。
5. Agent 在返回明文前提交脱敏 control event；event 提交失败时不得返回 Key。
6. Agent 解密后只返回 Key，不返回密文、nonce、主密钥信息或供应商原始数据。
7. Web 在向浏览器发送响应前写成功/失败平台审计；成功审计不可写时丢弃明文并失败关闭。
8. Web 返回版本化、`no-store` 的 JSON；浏览器内存显示 30 秒后清空。

Reveal 请求必须单独限流。连续失败触发现有安全审计，但响应只暴露固定错误类别。

## 14. 权限与审计

新增权限：

- `admin:assistant:configure`：保存、替换 Key、测试和启用；
- `admin:assistant:secret:reveal`：查看已保存 Key。

两者默认只授予 `super_admin`。现有 `admin:assistant` 继续授予现有角色，用于状态和测试控制台。后续可通过角色管理单独授权，不把角色名硬编码进 handler。

Web 平台审计新增事件：

- `assistant.model_config_save_requested`；
- `assistant.model_config_saved`；
- `assistant.model_config_test_requested`；
- `assistant.model_config_tested`；
- `assistant.model_config_activation_requested`；
- `assistant.model_config_activated`；
- `assistant.model_key_reveal_requested`；
- `assistant.model_key_revealed`。

元数据只允许：Provider、Model ID、Endpoint ID、revision、结果类别、request ID。禁止 Key、末四位、密文、nonce、完整 URL、模型响应或错误体。

Agent `control_events` 与 Web 平台审计使用同一 request ID 对齐。Web 不能跨数据库伪装原子事务；Agent control event 与配置写入同事务，Web 负责在发出命令前和返回结果前完成平台侧审计。任一高风险 reveal 审计失败都必须失败关闭。

## 15. 错误、并发与可观察性

对外固定错误类别：

- `validation_error`；
- `endpoint_not_allowed`；
- `configuration_conflict`；
- `credential_rejected`；
- `model_not_found`；
- `provider_unreachable`；
- `provider_timeout`；
- `control_disabled`；
- `storage_unavailable`；
- `encryption_unavailable`；
- `assistant_unavailable`。

供应商原始错误、状态体、响应头和 URL 不得进入浏览器或生产日志。内部日志只记录固定事件名、request ID、Provider、revision 和固定错误类别。

Agent 控制 API 使用固定 HTTP 映射：`validation_error`/`endpoint_not_allowed` 为 400，`configuration_conflict` 为 409，`credential_rejected`/`model_not_found` 为 422，`provider_unreachable` 为 502，`provider_timeout` 为 504，其余 `control_disabled`/`storage_unavailable`/`encryption_unavailable`/`assistant_unavailable` 为 503。Provider 返回空白或协议无效响应在内部归一为 `provider_unreachable`，不新增对外错误类别。内部 Bearer 缺失或无效返回 401，签名 assertion 无效或与路由不匹配返回 403。

并发更新使用 revision compare-and-swap。两个管理员编辑同一 Provider 时，后提交的旧 revision 必须收到 409，页面要求刷新，不能静默覆盖。Agent 使用单进程激活锁串行执行测试后的活动指针切换。

## 16. 扩展入口

### 16.1 Agno Skill

页面保留“Skill 加载”卡片，标记 `未接入`，按钮不可用。本期不创建假的 Skill API、空目录扫描或不可运行状态。

未来实现遵循 Agno `Skills(loaders=[LocalSkills(...)])` 边界，支持技能发现、按需读取和 `reload()`；Skill 与 Tools、Knowledge 分开管理。

### 16.2 Knowledge 与 Tools

分别保留“知识库”和“网页与操作工具”卡片，均标记 `未接入`。Knowledge 未来负责文档/网页内容和 RAG；Tools 未来负责外部动作与审批。两者不归入模型 Provider 配置。

### 16.3 本地算力

页面保留独立“本地算力”卡片，标记 `预留 / 未连接`，列出未来协议方向：

- Ollama；
- vLLM；
- OpenAI-compatible；
- 自有服务器模型仓库。

本期不把 `local` 加入可提交 Provider enum，不允许填写本地地址，也不发起健康探测。未来必须增加独立网络策略、Endpoint allowlist、认证、模型发现和健康检查，不能通过关闭 SSRF 防护直接接入。

## 17. 测试与验收

### 17.1 Agent 单元测试

- 数据模型、revision 和单活动指针；
- AES-GCM round-trip、随机 nonce、AAD、防篡改和错误密钥失败；
- Key 不进入 repr、异常或日志；
- Endpoint allowlist 和 Provider 匹配；
- 模型槽在切换前后选择正确 delegate；
- 进行中 run 保持旧 delegate；
- 六个 Provider 候选构造复用现有超时与禁重试设置；
- 测试失败不更新活动模型；
- bootstrap env 与动态配置优先级；
- reveal assertion 过期、重放和 revision 冲突。

### 17.2 Web 单元与合同测试

- 三个权限层级的页面与 API 行为；
- mutation 和 reveal 的 recent MFA；
- 严格合同、Origin、content type、body bound 和 409；
- 列表、状态和 SSR 不含明文 Key；
- reveal 响应 `no-store`；
- 30 秒自动隐藏和所有清理事件；
- 无查看权限时不渲染 reveal；
- 审计元数据不含 secret；
- Skill、Knowledge、Tools、本地算力诚实显示未接入。

### 17.3 数据库与角色边界

- migrator 可迁移 `agent_control` schema；
- control runtime 只能访问指定表和操作；
- 配置 mutation 与 control event 同事务，reveal 必须先落 control event；
- Web/runtime/backup/Agno 角色不能读取加密主密钥；
- 数据库落盘只出现密文，不出现测试 Key；
- 单活动指针和 revision 约束在并发下成立。

### 17.4 确定性容器 E2E

覆盖：

1. 无动态配置时安全占位；
2. 保存六个 Provider 的脱敏配置；
3. 候选测试失败后旧模型继续回答；
4. 成功测试并激活后无需重启即可回答；
5. Agent 重启后从动态活动配置恢复；
6. 过期 revision 返回 409；
7. 普通管理员不能配置或 reveal；
8. 超级管理员缺 recent MFA 时进入 re-auth；
9. reveal 30 秒后清空且响应/日志/审计无泄漏；
10. 部署总开关关闭时后台只读；
11. Skill、Knowledge、Tools、本地算力不产生实际请求；
12. 容器、卷、网络、镜像、锁和临时文件清理为零。

真实供应商 API smoke 继续显式、逐 Provider、凭据门控运行，不进入默认 CI。adapter-tested 与 real-API verified 必须继续分开表述。

## 18. 迁移与发布顺序

1. 新增权限、数据库角色、schema 和部署 Secret；
2. 新增加密存储、Endpoint allowlist 和内部控制 API；
3. 把现有 Provider verifier 抽成 CLI/Admin 可复用服务；
4. 引入模型槽并保持 env bootstrap 兼容；
5. 新增 Web BFF 合同、审计和 MFA guard；
6. 扩展现有 `/admin/assistant` 页面；
7. 增加确定性 E2E 和部署契约；
8. 先以部署总开关关闭状态发布，验证状态/权限/迁移；
9. 开启控制面并从后台首次激活动态配置；
10. 验证重启恢复和失败回滚后再移除日常 env 切换流程。

## 19. 官方参考

- Agno AgentOS Configuration: <https://docs.agno.com/agent-os/config>
- Agno Skills: <https://docs.agno.com/skills/overview>
- Agno Loading Skills: <https://docs.agno.com/skills/loading-skills>
- Agno Agent Tools: <https://docs.agno.com/tools/agent>
- Agno Knowledge Management: <https://docs.agno.com/agent-os/features/knowledge-management>
- Agno Ollama: <https://docs.agno.com/models/providers/local/ollama/overview>
- Agno vLLM: <https://docs.agno.com/models/providers/local/vllm/overview>
- Agno OpenAI-compatible Models: <https://docs.agno.com/models/providers/openai-like>
