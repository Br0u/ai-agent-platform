# Database

PostgreSQL schema、Drizzle迁移与健康检查。应用运行时必须提供`DATABASE_URL`。

## 权限拓扑

- `ai_agent_owner`：仅由 PostgreSQL 初始化使用，创建登录角色，不提供给 Web。
- `ai_agent_migrator`：仅由 `migrate` 服务使用，可执行 schema 迁移并维护默认权限。
- `ai_agent_runtime`：仅由 `web` 和只读备份使用，无 schema `CREATE` 权限；业务表按需获得读写权限，`audit_logs` 明确禁止 `UPDATE`/`DELETE`。

新库由 `infra/postgres/01-roles.sh` 创建角色。迁移结束后，`db:grant-runtime` 对现有表补授权，并为迁移角色创建的后续表设置默认权限。已有数据库必须由数据库管理员先执行同等角色初始化，再切换连接串；不要让 Web 使用 owner 或 migrator URL。

生成迁移：

```bash
pnpm --filter @ai-agent-platform/database db:generate
```

## 首位超级管理员

不存在默认管理员。迁移和权限种子完成后，在交互式 TTY 中执行：

```bash
docker compose run --rm -it migrate pnpm --filter @ai-agent-platform/database auth:create-super-admin
```

邮箱、用户名和两次隐藏密码均从终端读取；命令不接受命令行或环境变量明文密码。若已存在任意 `super_admin`，命令拒绝再次创建。用户、凭据、角色和审计事件在同一事务中写入。

`db:seed-auth-e2e` 与 `auth:assert-at-rest` 只允许 `NODE_ENV=test`，仅供自动化验收，严禁用于生产库。
