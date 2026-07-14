# AgentOS 助理运行边界验收

## 验收入口

```bash
sh docs/testing/run-assistant-runtime-e2e.sh
```

脚本固定使用`aap-assistant-runtime-e2e`隔离 Compose 项目；如需并发，可设置以`aap-assistant-runtime-e2e-`开头的项目名。它先在安全临时目录原子取得项目锁，再检查同名容器、卷、网络、标签镜像和本地命名镜像。已有锁、已有资源或`8080`被占用时均 fail closed，不接管、不清理；陈旧锁只允许人工核查后删除。只有完成检查并即将首次构建时才取得项目所有权，此后的成功、失败或信号退出才执行一次`down --rmi local -v --remove-orphans`，并仅在 token 仍匹配时释放自己的锁。

首次部署必须额外生成两个互不复用的密钥文件：`assistant_session_secret`和`assistant_rate_limit_secret`。两者都必须位于仓库外或已忽略目录、权限为`0600`，分别通过`ASSISTANT_SESSION_SECRET_FILE`和`ASSISTANT_RATE_LIMIT_SECRET_FILE`配置；禁止写入 Compose 渲染结果、日志或 Git。

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

- 部署合同：`35 passed`，其中 fake PATH 覆盖已有锁、已有资源、端口占用和取得所有权后首次构建失败四条清理路径。
- 最近一次容器 Runtime Playwright：`3 passed`，耗时 4.8 秒；本轮所有权修复因`8080`被 Shadowrocket 占用未重跑，未终止用户进程。
- 全仓最近一次测试：Integrations `7 passed`、UI `75 passed`、Web `955 passed / 43 skipped`；本轮 Database 全量为`123 passed / 17 skipped`。
- Agent：Pytest `89 passed / 1 skipped`，Ruff 与 Mypy 通过；TypeScript typecheck、lint、format check 与生产 build 全部通过。
- AgentOS 停止后约 1.5 秒观察到公开状态`degraded`，低于`1s TTL + 2s circuit reset + 5s margin`上限。
- 脚本完成后复核：本项目容器 0、卷 0、本地项目镜像 0。
- 容器日志敏感值扫描通过；未提交`.env.e2e`、临时密钥、Cookie、Playwright trace 或原始日志。
