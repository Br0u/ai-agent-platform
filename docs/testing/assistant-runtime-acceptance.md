# 码多多运行时与动态模型控制面验收

## 验收入口

```bash
RUN_ASSISTANT_RUNTIME_E2E=true ./docs/testing/run-assistant-runtime-e2e.sh
```

该脚本是离线、确定性的发布验收，不需要真实 Provider 凭据，也不访问外部模型网络。它默认使用隔离 Compose 项目 `aap-assistant-runtime-e2e`；并发项目名必须以 `aap-assistant-runtime-e2e-` 开头。

脚本先原子取得项目锁，再检查同名容器、卷、网络、标签镜像、本地命名镜像和 `8080` 端口。已有锁或资源时 fail closed，不接管、不清理；陈旧锁只允许人工核查后删除。脚本取得所有权后，成功、失败或信号退出都会执行一次限定项目的清理，并在 token 匹配时释放自己的锁。

## 生产 Secret 前置条件

首次部署至少准备以下独立 `0600` 单行 Secret 文件：

- `assistant_session_secret`、`assistant_rate_limit_secret`；
- `agent_control_migrator_database_password`、`agent_control_database_password`；
- `agent_control_migrator_database_url`、`agent_control_database_url`；
- `model_config_encryption_key`、`agent_config_control_key`。

它们必须位于仓库外或已忽略目录，不得进入 Compose 渲染输出、日志或 Git。AES 主密钥和内部控制 Key 不得与 `OS_SECURITY_KEY`、Better Auth、会话、限流或数据库密码复用。

## 自动验证范围

- 显式顺序构建当前 `migrate`、Agent migration、`agent`、`backup` 和 `web` 镜像，降低本地 Docker 内存峰值。
- 按 `db → platform migrate → Agno bootstrap → control roles → Agent/control migrate → agent → seeded web → proxy → backup` 启动；migration/bootstrap 均验证幂等。
- 每个 `compose run --rm` 一次性任务的 stdout/stderr 先写入临时 `0600` transcript，并立即接受完整 protected-pattern、动态值、完整模型 Key 和末四位扫描。原始 transcript 不回显到终端。
- Guard 阶段执行 6 条安全前置测试；placeholder 阶段执行 2 条公开/鉴权边界测试；AgentOS 阶段执行 4 条真实单 Agent 会话测试；dynamic-control 阶段执行 1 条完整后台控制面测试。
- AgentOS 和 dynamic-control 只注入验收镜像内的离线确定性模型，保留生产 verifier、鉴权、仓储、AES-GCM、Endpoint allowlist、活动指针、运行时槽和启动 reconciliation。验收 Agent 不连接 `model_egress`，并对任意 socket 外联 fail fast。
- 六家 Provider 都通过 `/admin/assistant` 保存唯一夹具 Key。失败候选不替换旧活动模型；成功候选热切换时 Agent 容器不重启；主动重启后从动态活动指针恢复。
- 验证普通管理员只读、当前 MFA 模型管理员可配置/查看、过期 MFA 跳转重新验证、revision 冲突、kill switch、bootstrap Key 不可查看，以及明文 Key 30 秒 DOM 清理。
- 页面所有 `/api/v1/**` 响应，以及验收主动读取的 control/chat JSON 响应，都进入终态账本并默认 strict。只有精确的配置 list/save DTO 可显示对应末四位，只有精确 reveal 200 响应可显示对应完整 Key；会话 token、其他完整 Key 和独立末四位均不得出现。
- Web 平台审计、Agent control event、浏览器控制台、HTTP 错误体、常驻容器日志和一次性任务 transcript 都不得包含完整 Key 或末四位。
- Skill、Knowledge、Tools/网页操作和本地算力卡片显示批准的未接入状态；点击禁用控件后请求数组必须严格为空。
- 公开和 Admin 状态只暴露固定标识 `码多多（maduoduo）` 与安全能力字段，不泄漏内部 URL、提示词、凭据或供应商错误体。
- 同一 Cookie 两轮连续对话、独立浏览器上下文、session 删除重建、Admin 临时 session 立即删除、未认证 WebSocket 403、执行熔断和恢复均使用真实 AgentOS 路径。
- `web`、`agent`、`db` 不发布主机端口，`proxy:8080` 是唯一入口。结束后再次断言无本项目容器、卷、网络、本地镜像、临时 Secret/pattern/transcript 和项目锁。

## 发布验收顺序

```bash
uv --directory apps/agent lock --check
uv --directory apps/agent run pytest -q
uv --directory apps/agent run ruff check .
uv --directory apps/agent run mypy src tests
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts
RUN_ASSISTANT_RUNTIME_E2E=true ./docs/testing/run-assistant-runtime-e2e.sh
```

PostgreSQL integration 和真实 Provider 测试只能在各自文档要求的变量缺失时跳过；跳过不等于数据库或真实 API 已验证。真实 Provider 冒烟不属于默认 CI，也不应在没有明确提供凭据时运行。

## 最近一次本地证据

2026-07-19 在 macOS Docker Desktop ARM64 基于 `cd3ed28` 及当前 Task 22 工作树运行最终动态控制验收：

- Guard `6 passed`；placeholder/auth `2 passed`；deterministic AgentOS `4 passed`；dynamic control `1 passed`。
- 覆盖六 Provider、失败保旧、热切换、重启恢复、reveal、双层审计、防泄露和 kill switch。
- 终行确认 guard、placeholder、AgentOS bootstrap、dynamic control、recovery、reveal 和 zero-residue cleanup 全部通过。
- 脚本退出后独立查询容器、卷、网络和隔离镜像，四项均为空。
