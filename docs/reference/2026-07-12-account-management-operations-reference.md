# AI Agent Platform 账号与权限管理操作参考

> 日期：2026-07-12
>
> 文档性质：内部参考资料，供后续编写正式用户操作手册、管理员手册和部署手册时使用。
>
> 当前状态：身份认证、账号管理、RBAC、会话、TOTP、审计和本地 PostgreSQL 环境已经实现并通过验收；SMTP、SSO、找回密码等外部能力尚未接入。

## 1. 今日完成内容概览

今日完成并合入 `main` 的账号管理能力包括：

- 建立客户、内部员工、管理员三类使用场景。
- 客户身份域与内部员工身份域完全分离。
- 客户可自主提交注册申请，由管理员审核。
- 内部员工账号由管理员创建，不开放员工自助注册。
- 员工首次登录必须修改临时密码。
- 管理员和超级管理员必须完成 TOTP 才能执行敏感管理操作。
- 支持用户启用、停用、恢复、临时密码替换、角色分配和会话撤销。
- 支持角色、权限和操作审计查询。
- PostgreSQL 使用 owner、migrator、runtime、backup 四类数据库角色。
- 本地 Next.js 已连接 Docker PostgreSQL，注册页和数据库健康检查正常。
- GitHub PR #1 已合并，CI 全部通过。

## 2. 用户类型与身份域

| 类型       | 身份域      | 创建方式                 | 登录入口       | 主要用途                         |
| ---------- | ----------- | ------------------------ | -------------- | -------------------------------- |
| 客户用户   | `customer`  | 自助注册后等待审核       | `/login`       | 客户控制台、资源和服务入口       |
| 内部员工   | `workforce` | 管理员创建               | `/staff/login` | 内部管理后台及被授权功能         |
| 管理员     | `workforce` | 超级管理员创建或授权     | `/staff/login` | 用户、注册、会话、角色和内容管理 |
| 超级管理员 | `workforce` | 首次部署时由终端命令创建 | `/staff/login` | 全部系统管理能力                 |

关键原则：

- 客户和员工使用不同的认证入口、会话 Cookie 和身份域。
- 客户 Cookie 不能用于员工后台，员工 Cookie 不能用于客户控制台。
- 客户账号不能被分配内部员工角色。
- 内容运营人员不能因为可以进入后台就自动获得用户和角色管理权限。

## 3. 页面和操作入口

| 路径                     | 用途                               | 使用者                 |
| ------------------------ | ---------------------------------- | ---------------------- |
| `/register`              | 客户注册申请                       | 未登录客户             |
| `/login`                 | 客户登录                           | 客户用户               |
| `/console/onboarding`    | 查看注册审核或账号准备状态         | 待审核客户             |
| `/console`               | 客户控制台                         | 审核通过的客户         |
| `/staff/login`           | 员工与管理员登录                   | 内部员工               |
| `/staff/change-password` | 首次登录或临时密码更换             | 内部员工               |
| `/staff/two-factor`      | TOTP 设置、验证与恢复码管理        | 管理员、可选员工       |
| `/staff/re-auth`         | 敏感操作前重新认证                 | 管理员                 |
| `/admin/users`           | 用户、账号状态、临时密码和会话管理 | 有用户管理权限的管理员 |
| `/admin/registrations`   | 客户注册审核                       | 有注册审核权限的管理员 |
| `/admin/roles`           | 内部员工角色管理                   | 有角色管理权限的管理员 |
| `/admin/audit-logs`      | 操作审计查询                       | 有审计查看权限的管理员 |

## 4. 本地开发环境操作

### 4.1 当前本地架构

- Next.js 在宿主机运行：`http://127.0.0.1:3000`。
- PostgreSQL 18 在 Docker 中运行。
- PostgreSQL 仅绑定 `127.0.0.1:5432`，不对局域网开放。
- 数据保存于 Docker volume：`ai-agent-platform_db_data`。
- 根 `.env`、`apps/web/.env.local` 和 `tmp/local-dev/` 均被 Git 忽略。

### 4.2 初始化本地环境文件

```bash
node tmp/local-dev/setup-local-env.mjs
```

脚本行为：

- 保留已经配置的非占位值。
- 为 owner、migrator、runtime、backup 和 Better Auth 生成独立随机密钥。
- 更新根 `.env` 中 Docker 使用的连接串。
- 创建 `apps/web/.env.local`，供宿主机 Next.js 使用。
- 环境文件权限设置为 `0600`。

不得把 `.env` 或 `.env.local` 内容复制到文档、工单、GitHub Issue 或聊天记录中。

### 4.3 启动数据库

```bash
docker compose \
  -f compose.yaml \
  -f tmp/local-dev/compose.dev.yaml \
  up -d --wait db
```

### 4.4 执行迁移、权限种子和数据库授权

```bash
docker compose \
  -f compose.yaml \
  -f tmp/local-dev/compose.dev.yaml \
  run --rm migrate
```

当前应存在 6 条迁移记录。

### 4.5 启动本地前端

```bash
pnpm dev
```

验证地址：

- 注册页：`http://127.0.0.1:3000/register`
- 客户登录：`http://127.0.0.1:3000/login`
- 员工登录：`http://127.0.0.1:3000/staff/login`
- 数据库就绪：`http://127.0.0.1:3000/api/health/ready`

### 4.6 停止数据库但保留数据

```bash
docker compose \
  -f compose.yaml \
  -f tmp/local-dev/compose.dev.yaml \
  stop db
```

禁止随意执行：

```bash
docker compose down -v
```

`-v` 会删除数据库 volume 和全部本地数据。

## 5. 首位超级管理员初始化

首次使用空数据库时，需要在终端交互创建唯一的超级管理员。

当前本地开发环境使用以下命令：

```bash
docker compose \
  -f compose.yaml \
  -f tmp/local-dev/compose.dev.yaml \
  run --rm -it migrate \
  node --import tsx src/create-super-admin.ts
```

命令会交互读取：

- 管理员邮箱。
- 管理员用户名。
- 密码。
- 再次确认密码。

安全要求：

- 密码通过隐藏终端输入，不放在命令行参数或环境变量中。
- 如果数据库中已经存在任意 `super_admin`，命令会拒绝再次初始化。
- 用户、密码凭据、角色和审计事件在同一事务内创建。

创建后首次登录流程：

1. 打开 `/staff/login`。
2. 输入用户名或邮箱及初始化密码。
3. 按要求修改临时密码。
4. 进入 `/staff/two-factor` 设置 TOTP。
5. 保存一次性显示的恢复码。
6. 完成 TOTP 验证后进入管理员后台。

## 6. 客户注册与审核

### 6.1 客户提交注册

1. 客户访问 `/register`。
2. 填写联系人、邮箱、公司等真实资料。
3. 提交后创建客户身份和注册申请。
4. 初始状态为 `pending_review`。
5. 客户登录后只能进入 onboarding 状态页，不能进入正式 Console。

当前没有 SMTP，因此：

- 不会真实发送验证邮件。
- 邮箱验证重发接口返回 `501 EMAIL_VERIFICATION_DISABLED`。
- 操作手册不能写成“系统会发送邮件”。

### 6.2 管理员审核注册

1. 管理员登录 `/staff/login`。
2. 完成 TOTP 或按要求重新认证。
3. 进入 `/admin/registrations`。
4. 按状态筛选待审核申请。
5. 查看申请人、公司和组织归属信息。
6. 批准或拒绝申请。

审核结果：

- 批准：客户和组织状态变为可用，客户可以进入 Console。
- 拒绝：客户保留可追溯记录，但不能进入 Console。
- 审核操作写入审计日志。

## 7. 内部员工账号创建

内部员工不允许自助注册，由管理员创建。

操作步骤：

1. 进入 `/admin/users`。
2. 在“创建员工”区域填写姓名、邮箱、用户名和初始角色。
3. 系统生成或设置临时密码凭据。
4. 将临时密码通过公司认可的安全渠道交给员工。
5. 员工首次登录 `/staff/login`。
6. 系统强制跳转 `/staff/change-password`。
7. 修改完成后才能继续进入授权页面。

注意：

- 不通过邮件自动发送初始密码。
- 不把临时密码写入工单、日志或审计元数据。
- 管理员替换临时密码后，员工旧会话会失效。

## 8. 账号状态管理

在 `/admin/users` 可进行以下操作：

### 8.1 停用账号

- 停用后用户不能创建新会话。
- 已有会话在下一次检查时被拒绝。
- 停用操作必须写入审计日志。

### 8.2 恢复账号

- 仅恢复账号状态，不恢复已撤销的旧会话。
- 用户需要重新登录。
- 如仍处于首次密码状态，继续要求修改密码。

### 8.3 替换临时密码

- 管理员为员工重新生成或设置临时密码。
- 原有相关会话被撤销。
- 用户下次登录必须修改临时密码。

### 8.4 搜索与筛选

用户列表支持按身份域、状态、关键词和分页查询。管理操作必须基于服务端权限检查，不能只依赖页面是否显示按钮。

## 9. 角色与权限管理

角色管理入口：`/admin/roles`。

基本操作：

1. 搜索目标角色或员工。
2. 选择内部员工。
3. 添加允许分配的角色。
4. 移除不再需要的角色。
5. 验证目标员工的下一次权限检查结果。

安全行为：

- 角色添加或移除必须写审计日志。
- 角色移除后，相关会话会被撤销或在下一次授权检查时失效。
- 客户身份域不能混用内部角色。
- 页面隐藏按钮不等于权限控制；服务端 Server Action 会再次检查权限。
- 普通员工重放管理员操作会返回 `AUTH_PERMISSION_DENIED`。

## 10. 会话管理

管理员可以在 `/admin/users` 查看用户会话并执行：

- 撤销指定会话。
- 撤销该用户全部会话。
- 停用账号时同步阻止旧会话继续使用。
- 替换临时密码后使旧会话失效。

预期行为：

- 被撤销会话返回 `401 AUTH_SESSION_REQUIRED`。
- 撤销别人的会话不会误伤当前管理员会话。
- 服务重启后撤销状态仍保留，因为会话存储在 PostgreSQL。

## 11. TOTP、重新认证和恢复码

### 11.1 TOTP

- `admin` 和 `super_admin` 在执行敏感操作前必须完成 TOTP。
- 普通员工可配置 TOTP，但当前阶段不是强制要求。
- TOTP 页面提供二维码、手工 URI 和六位验证码输入。

### 11.2 敏感操作重新认证

入口：`/staff/re-auth`。

以下类型操作要求近期密码和 TOTP 验证：

- 创建、停用或恢复员工账号。
- 替换临时密码。
- 修改角色或权限。
- 审核客户注册。
- 撤销用户会话。
- 修改站点安全配置。

重新认证有效窗口为十分钟。旧会话不会被直接提升安全级别；系统会撤销旧会话并创建经过重新验证的新会话。

### 11.3 恢复码

- 恢复码只在生成时显示一次。
- 数据库只保存哈希，不保存明文。
- 每个恢复码只能使用一次。
- 使用后对应哈希会被删除或标记消费。
- 恢复码不得截图上传工单或保存到 Git 仓库。

## 12. 操作审计

入口：`/admin/audit-logs`。

需要审计的操作包括：

- 登录成功、登录失败和退出。
- 客户注册提交和管理员审核。
- 员工创建、停用、恢复和临时密码替换。
- 角色添加、角色移除和权限修改。
- 单会话和全部会话撤销。
- TOTP 设置、恢复码生成、TOTP 移除。
- 其他受保护的管理员敏感操作。

审计要求：

- 时间统一按北京时间展示。
- 敏感字段和凭据不能写入审计元数据。
- Web 运行账户不能更新或删除审计记录。
- 审计服务只提供查询和追加，不提供修改或删除接口。

## 13. 安全控制摘要

- 密码采用安全哈希存储，不保存明文。
- 客户与员工使用独立 Cookie 名称。
- Cookie 使用 `HttpOnly`、`SameSite=Lax`；生产 HTTPS 使用 `Secure`。
- 登录、重新认证和恢复流程使用账号与 IP 双层数据库限流。
- 限流键使用 HMAC，不将明文账号写入限流表。
- Nginx 对认证 POST 请求提供外层限流。
- 权限在服务端检查，不能通过前端请求重放绕过。
- 数据库运行账户不能修改 schema。
- 审计日志对运行账户不可更新、不可删除。
- 数据库角色分为 owner、migrator、runtime、backup。

## 14. 今日真实验收结果

| 场景                     | 结果                                    |
| ------------------------ | --------------------------------------- |
| 匿名访问客户或管理员空间 | 被重定向到对应登录入口                  |
| 待审核客户               | 只能查看 onboarding，不能进入 Console   |
| 已激活客户               | 可进入 Console，不能进入 Admin          |
| 普通员工                 | 可进入授权后台，不能执行管理员操作      |
| 禁用账号                 | 下一次会话检查返回拒绝                  |
| 错误身份域 Cookie        | 返回 401                                |
| 角色移除                 | 下一次授权失败，相关会话失效            |
| 单会话撤销               | 被撤销会话 401，当前管理员会话保持有效  |
| 未配置 TOTP 的管理员     | 敏感操作返回 `AUTH_TOTP_SETUP_REQUIRED` |
| 已验证 TOTP 的管理员     | 可执行被授权的敏感操作                  |
| 恢复码首次使用           | 成功                                    |
| 恢复码重复使用           | 返回 `AUTH_INVALID_CREDENTIALS`         |
| 邮箱重发                 | 返回 `501 EMAIL_VERIFICATION_DISABLED`  |
| 本地注册页               | HTTP 200                                |
| 数据库健康接口           | HTTP 200                                |

自动化测试结果：

- Database：114 项。
- Web：528 项。
- UI：57 项。
- Integrations：7 项。
- PostgreSQL 限流集成测试：7 项。
- 部署契约：14 项。
- GitHub Actions 最终通过。

## 15. 今日遇到的问题及处理

### 15.1 页面没有变化

原因：浏览器显示旧缓存，或 `localhost:3000` 由旧目录进程提供。

检查方式：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

处理：停止旧进程，从最新 `main` 重新运行 `pnpm dev`。

### 15.2 `DATABASE_URL is required`

原因：只启动了 Next.js，没有配置数据库连接。

处理：

- 启动 Docker PostgreSQL。
- 创建 `apps/web/.env.local`。
- 重启 Next.js，让其重新加载环境变量。

### 15.3 数据库端口声明存在但宿主机无法连接

原因：生产 `backend` 网络使用 `internal: true`，Docker 不发布该网络上的宿主机端口。

本地处理：在 `tmp/local-dev/compose.dev.yaml` 中为数据库额外挂载非 internal 的 `dev_host` 网络，同时只绑定 `127.0.0.1:5432`。

### 15.4 迁移容器出现 `/app` 写入权限错误

错误示例：

```text
EACCES: permission denied, open '/app/_tmp_...'
```

原因：迁移镜像以 `node` 用户运行，但 `pnpm` 启动前尝试在 root 所有的 `/app` 写依赖状态临时文件。

本地处理：本地 override 不使用 `pnpm db:prepare`，而是以 `node` 用户直接通过 `node --import tsx` 执行迁移、权限种子和授权脚本。

注意：这是仓库原始迁移镜像仍需正式修复的问题。按照当前要求，本地 workaround 没有提交到 GitHub。

### 15.5 GitHub CI 并发测试失败

原因：测试等待数据库锁时延迟绑定 Promise rejection，Linux/Node 先将预期数据库拒绝判定为未处理错误。

处理：查询创建后立即绑定 rejection 断言。真实 PostgreSQL 并发测试连续运行 20 次通过。

### 15.6 GitHub CI Nginx 校验失败

错误：

```text
unknown "allow_local_validation_hosts" variable
```

原因：CI Nginx 容器遗漏 `ALLOW_LOCAL_VALIDATION_HOSTS=false`。

处理：补充环境变量并增加部署契约测试，最终 CI 通过。

## 16. 当前未开放能力

以下能力不得在正式操作手册中描述为“已上线”：

- SMTP 邮件发送和真实邮箱验证。
- 忘记密码与用户自助找回密码。
- SSO、LDAP、企业微信或其他第三方身份认证。
- License 实际授权系统。
- 下载中心真实文件和下载鉴权。
- OpenLab 实际申请和授权。
- Marketplace 外部资源和一键克隆。
- 支付、订单和正式账单。

当前页面或接口应保持明确占位、禁用或返回 `501`，不能提供无结果的假操作。

## 17. 后续正式操作手册建议拆分

后续可以基于本文拆成以下正式文档：

1. 《客户注册与登录操作手册》
2. 《内部员工首次登录与密码修改指南》
3. 《管理员用户与账号状态管理手册》
4. 《角色与权限配置手册》
5. 《TOTP 与恢复码使用指南》
6. 《会话撤销与账号安全处置手册》
7. 《操作审计查询手册》
8. 《本地开发数据库启动手册》
9. 《生产环境身份系统部署与初始化手册》
10. 《账号管理常见问题与故障排查》

## 18. 代码与原始资料索引

| 内容             | 路径                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| 产品需求         | `docs/product/PRD.md`                                                 |
| 身份权限设计     | `docs/superpowers/specs/2026-07-11-identity-access-control-design.md` |
| 身份权限实施计划 | `docs/superpowers/plans/2026-07-11-identity-access-control.md`        |
| 验收记录         | `docs/testing/identity-access-control-acceptance.md`                  |
| 部署准备         | `docs/deployment/server-readiness.md`                                 |
| 数据库使用说明   | `packages/database/README.md`                                         |
| 用户管理页面     | `apps/web/src/app/admin/users/page.tsx`                               |
| 注册审核页面     | `apps/web/src/app/admin/registrations/page.tsx`                       |
| 角色管理页面     | `apps/web/src/app/admin/roles/page.tsx`                               |
| 审计页面         | `apps/web/src/app/admin/audit-logs/page.tsx`                          |
| 账号管理服务     | `apps/web/src/server/admin/users.ts`                                  |
| 角色服务         | `apps/web/src/server/admin/roles.ts`                                  |
| 会话服务         | `apps/web/src/server/admin/sessions.ts`                               |
| 认证操作         | `apps/web/src/server/auth/actions.ts`                                 |
| 注册服务         | `apps/web/src/server/registration/service.ts`                         |
| 本地开发说明     | `tmp/local-dev/README.md`                                             |

---

本文只记录当前已经实现和实际验证的行为。后续产品逻辑、字段、权限名称或页面结构发生变化时，应同步更新本文，再据此编写对外操作手册。
