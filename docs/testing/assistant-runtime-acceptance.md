# AgentOS 助理运行边界验收

## 验收入口

```bash
sh docs/testing/run-assistant-runtime-e2e.sh
```

脚本固定使用`aap-assistant-runtime-e2e`隔离 Compose 项目；如需并发，可设置以`aap-assistant-runtime-e2e-`开头的项目名。它拒绝复用已有项目和已占用的`8080`端口，创建资源前安装清理 trap，结束时执行`down --rmi local -v --remove-orphans`。

## 自动验证范围

- 显式构建当前`migrate`、`web`、`agent`和`backup`镜像。
- 按`db → platform migrate（两次）→ agno-bootstrap（两次）→ agent-migrate（两次）→ agent → seeded web → proxy → backup`启动。
- `web`和`agent`不发布主机端口，`proxy:8080`是唯一入口。
- 公开状态通过 BFF 报告 AgentOS `live=true`、`ready=true`、`capability=placeholder`。
- HTTP 本地验收只签发`aap_assistant_sid_dev`、`HttpOnly`、`SameSite=Lax` Cookie；生产 HTTPS Cookie 属性由单元测试覆盖。
- 占位聊天成功且 Cookie 凭据不进入 JSON、浏览器控制台、容器日志或 Admin 元数据。
- Nginx 使用新会话和固定突发序列验证第一层 IP 429；应用 PostgreSQL 限流继续由直接 handler/集成测试覆盖。
- Admin status、sessions、chat 均覆盖无会话 401、普通员工 403、管理员成功；会话列表明确为空且持久化关闭。
- 停止 AgentOS 后，在 readiness TTL、circuit reset 和固定余量内观察公开状态降级。
- 生成一次加密备份，并检查所有临时凭据文件为外部`0600`文件。

## 最近一次本地证据

2026-07-14 在 macOS Docker Desktop ARM64 运行：

- 部署合同：`33 passed`。
- Runtime Playwright：`3 passed`，耗时 4.8 秒。
- 全仓测试：Integrations `7 passed`、UI `75 passed`、Database `121 passed / 17 skipped`、Web `955 passed / 43 skipped`。
- Agent：Pytest `89 passed / 1 skipped`，Ruff 与 Mypy 通过；TypeScript typecheck、lint、format check 与生产 build 全部通过。
- AgentOS 停止后约 1.5 秒观察到公开状态`degraded`，低于`1s TTL + 2s circuit reset + 5s margin`上限。
- 脚本完成后复核：本项目容器 0、卷 0、本地项目镜像 0。
- 容器日志敏感值扫描通过；未提交`.env.e2e`、临时密钥、Cookie、Playwright trace 或原始日志。
