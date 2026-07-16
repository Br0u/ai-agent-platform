# AgentOS 助理运行边界验收

## 验收入口

```bash
RUN_ASSISTANT_RUNTIME_E2E=true docs/testing/run-assistant-runtime-e2e.sh
```

脚本只有在 `RUN_ASSISTANT_RUNTIME_E2E=true` 时才执行，并固定使用 `aap-assistant-runtime-e2e` 隔离 Compose 项目；如需并发，可设置以 `aap-assistant-runtime-e2e-` 开头的项目名。它先在安全临时目录原子取得项目锁，再检查同名容器、卷、网络、标签镜像和本地命名镜像。已有锁、已有资源或 `8080` 被占用时均 fail closed，不接管、不清理；陈旧锁只允许人工核查后删除。只有完成检查并即将首次构建时才取得项目所有权，此后的成功、失败或信号退出才执行一次 `down --rmi local -v --remove-orphans`，并仅在 token 仍匹配时释放自己的锁。

首次部署必须额外生成两个互不复用的密钥文件：`assistant_session_secret` 和 `assistant_rate_limit_secret`。两者都必须位于仓库外或已忽略目录、权限为 `0600`，分别通过 `ASSISTANT_SESSION_SECRET_FILE` 和 `ASSISTANT_RATE_LIMIT_SECRET_FILE` 配置；禁止写入 Compose 渲染结果、日志或 Git。

## 自动验证范围

- 显式构建当前 `migrate`、`web`、`agent` 和 `backup` 镜像。
- 按 `db → platform migrate（两次）→ agno-bootstrap（两次）→ agent-migrate（两次）→ agent → seeded web → proxy → backup` 启动。
- 安全 guard 独立执行 6 条测试；第一阶段只执行 2 条 placeholder 测试，验证公开状态、占位聊天、Nginx IP 限流，以及 Admin API 的 401/403/成功边界。
- 第一阶段结束后立即独立扫描其容器日志。所有环境凭据、E2E 密码和 session token、AgentOS 运行令牌、模型夹具、派生数据库 URL 及 Secret 文件路径均写入临时 `0600` pattern 文件；测试运行中生成的 TOTP URI 与 secret、Agent session identity、Cookie 原始值与解码凭据另写入该阶段专属的临时 `0600` pattern 文件。两类文件均使用 `grep -F -f` 检查，凭据不进入命令参数或输出；`grep` 命中或扫描器异常都会 fail closed。
- 第二阶段在同一数据库卷内强制重建 `agent`、`web` 和 `proxy`，切换为 `ASSISTANT_PROVIDER_MODE=agentos`、`AGENT_ENABLED=true`，重新播种固定鉴权夹具并重置 Nginx 限流状态；完成 4 条 AgentOS 测试后，使用独立的动态 pattern 文件再次扫描日志。
- AgentOS 阶段只注入验收镜像内的离线确定性模型；验收 Agent 只连接内部 `backend` 网络，不连接 `model_egress`，关闭 Agno telemetry，且测试对任意 socket 网络访问 fail fast。生产与验收 Agent 均关闭会记录内部 session identity 路径的 Uvicorn access log。生产镜像仍以最后一个 `runtime` target 为默认产物，且不包含验收包。
- 公开与 Admin 状态只暴露固定标识 `码多多（maduoduo）` 和安全能力字段，不泄漏内部地址、模型 ID、提示词或凭据。
- 真实 AgentOS 调用验证同一 Cookie 两轮连续对话且 Cookie 凭据稳定；第二个独立浏览器上下文从第一轮开始。`DELETE /api/v1/assistant/session` 后，旧 Agno session identity 必须从数据库消失，清除 Cookie，并以不同 identity 从第一轮重新开始。
- Admin 临时聊天前后 Agno session identity 集合必须完全一致；当前 Admin 会话列表明确返回 `listing=not_available`，不伪造持久化列表。
- 保留值触发无效模型输出后，BFF 安全返回 503；紧接着的普通请求必须在任何 Admin 鉴权前被已打开的执行熔断拒绝，公开状态随后降级。
- 从 Compose 内网直连 `agent:7777/workflows/ws` 的未认证 WebSocket Upgrade 必须立即收到 wire-level HTTP 403；超时不算拒绝成功。`web`、`agent`、`db` 均不发布主机端口，`proxy:8080` 是唯一入口。
- 生成一次加密备份，并检查所有临时凭据文件为外部 `0600` 文件。

## 最近一次本地证据

2026-07-16 在 macOS Docker Desktop ARM64 运行：

- 完整三阶段 Runtime Playwright：guard `6 passed`、placeholder `2 passed`、deterministic AgentOS `4 passed`。
- AgentOS 阶段覆盖状态边界、Admin 临时运行清理、真实两轮会话、删除重置、WebSocket 拒绝、端口隔离、无效输出与熔断降级。
- 离线确定性模型 focused 测试：`12 passed`。
- 脚本成功退出后由所有权 trap 清理本项目容器、卷、网络、本地镜像、临时密钥和项目锁。
