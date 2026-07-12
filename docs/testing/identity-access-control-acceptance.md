# 身份与权限控制验收记录

日期：2026-07-12

分支：`codex/feat-identity-access-control`

## 结论

Task 12 的本地实现与验收通过，可进入最终代码评审。SMTP、SSO、License、Download、OpenLab 仍未接入；对应接口返回明确禁用状态或页面保持占位，不能按已上线理解。

## 自动化质量门禁

| 门禁                                        | 结果                          |
| ------------------------------------------- | ----------------------------- |
| Database                                    | 113 passed（隔离 PostgreSQL） |
| Integrations                                | 7 passed                      |
| UI                                          | 57 passed                     |
| Web                                         | 521 passed（隔离 PostgreSQL） |
| TypeScript / ESLint / Prettier / Next build | PASS                          |

数据库集成行为另在隔离 PostgreSQL 中执行；浏览器行为在 Docker 生产镜像后方的 Nginx 入口执行。

## 干净 Docker 环境

- 使用全新 Compose project `aap-auth-acceptance` 和全新数据库卷构建当前 HEAD。
- `db`、`web`、`proxy` 健康，`migrate` 成功退出，`backup` 正常运行；PostgreSQL 未发布主机端口。
- `/api/health/live` 与 `/api/health/ready` 返回 200。
- 空库没有默认超级管理员。TTY 引导创建后，查询结果为 `1|t`：恰好一个 `super_admin`，且 `must_change_password=true`；重复创建会拒绝。
- Nginx Host 来源门禁：生产模式只允许 `PUBLIC_HOST`；`127.0.0.1`、`localhost`和未知 Host 返回 421。只有显式设置`ALLOW_LOCAL_VALIDATION_HOSTS=true`时才允许本机验收 Host。
- 有效管理员会话在重启`web`与`proxy`后仍返回 200；撤销后返回 401，再次重启后仍为 401。
- E2E 密码、替换密码和全部会话 token 均在运行时用`openssl rand`生成；seed、Playwright 和数据库断言只从环境变量读取，不提交也不打印具体值。
- 备份镜像实际运行用户为`postgres`（UID 70）、只读根文件系统且丢弃全部 capabilities；真实 custom dump 恢复到新临时卷后，迁移历史和`users`关键表检查通过（`migrations=1 users=1`）。

## 浏览器与访问矩阵

所有共享安全状态用例均为 desktop 单 worker 串行执行；无状态页面同时执行 desktop 和 390×844 mobile。

| 行为                   | 证据                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 游客进入 Console/Admin | 分别重定向到客户/员工登录页                                                                                                                          |
| 待审核客户             | 可见 onboarding；Console 被重定向                                                                                                                    |
| 正常客户               | Console 可用；Admin 被拒绝                                                                                                                           |
| 普通员工               | Admin 外壳可用；从管理员页面截获并中止真实 Next Server Action，再以员工会话重放相同 mutation，响应稳定返回`AUTH_PERMISSION_DENIED`且目标会话仍为 200 |
| 禁用账号               | 下一次会话检查 403                                                                                                                                   |
| 错误身份域 Cookie      | 会话检查 401                                                                                                                                         |
| 角色移除               | 下一次授权检查 401，相关会话被撤销                                                                                                                   |
| 单会话撤销             | 被撤销 token 的 staff session API 返回`401 AUTH_SESSION_REQUIRED`，当前管理员会话同时保持 200                                                        |
| 管理员替换临时密码     | 员工旧会话下一次检查 401                                                                                                                             |
| 管理员 TOTP            | 注册前会话接口明确返回`403 AUTH_TOTP_SETUP_REQUIRED`且敏感表单不在响应中；完成真实 TOTP 后允许授权的会话撤销操作                                     |
| 未配置 TOTP 的管理员   | 以独立管理员会话重放从已验证管理员页面截获的真实 Next Server Action，响应稳定返回`AUTH_TOTP_SETUP_REQUIRED`，目标会话保持 200                        |
| 恢复码                 | 数据库只存在哈希；首次使用成功，第二次真实 Server Action 返回`AUTH_INVALID_CREDENTIALS`；消费后哈希与替换前会话均不存在                              |
| 注册限流               | 重复无效提交出现 429                                                                                                                                 |
| 邮箱重发禁用           | `501 EMAIL_VERIFICATION_DISABLED`                                                                                                                    |
| 健康接口               | 游客访问均为 200                                                                                                                                     |
| 响应式与控制台         | desktop/mobile 共 6 个无状态用例通过，无横向溢出或 console error                                                                                     |

最终分段顺序结果：TOTP 1/1、恢复码 1/1、其余访问矩阵 11/11；无状态 desktop/mobile 6/6。TOTP 与恢复码共享真实 Nginx 认证限流桶，因此两段之间重启本地验收 proxy 以隔离用例，不降低生产限流。恢复码明文和浏览器 storage state 验收后已删除，均未进入 Git。

生产 Cookie 属性由认证配置测试验证：客户与员工会话均为`HttpOnly`、`SameSite=Lax`；HTTPS/生产配置包含`Secure`。客户与员工使用不同 Cookie 名，不接受跨身份域复用。管理员未完成 TOTP 时的敏感操作拒绝、权限服务端复核、审计不可篡改、账号/IP 双层限流均由 Web/数据库自动化测试覆盖。

## 查询计划与索引

在事务内构造 30,000 用户、90,000 会话、180,000 审计、500 角色、1,000 权限和 5,000 角色权限关系，执行`EXPLAIN (ANALYZE, BUFFERS)`后回滚。

| 查询                        | 结果与决定                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 用户深分页 OFFSET 20,000    | 约 14.19 ms；候选索引无改善，不新增索引，后续改 keyset pagination                                                |
| 角色权限                    | 既有索引约 0.14 ms，不新增                                                                                       |
| 用户会话                    | 既有索引约 0.02 ms，不新增                                                                                       |
| 按 actor 查审计             | 既有索引约 0.02 ms，不新增                                                                                       |
| 默认审计分页 OFFSET 100,000 | 由外部排序约 24.34 ms 降至索引扫描约 8.82 ms；新增`audit_logs(created_at DESC NULLS FIRST, id DESC NULLS FIRST)` |

## 上线前仍需提供

- 正式域名、TLS 证书、反向代理/防火墙规则和生产密钥；`ALLOW_LOCAL_VALIDATION_HOSTS`必须保持`false`。
- 正式 PostgreSQL、异机加密备份目标、生产恢复负责人、监控告警与日志留存策略；仓库内隔离恢复脚本已经过本地真实 dump 演练。
- SMTP Provider 与邮箱验证/找回密码流程；启用前重发接口保持 501。
- 企业 SSO/IdP 配置及账号生命周期规则。
- License、Download、OpenLab 的真实 Provider、资产和审批流程。
- 远端 GitHub Actions 尚未在本地验收中执行，合并前必须通过最终代码评审和远端 CI。

## 已知非阻塞项

- 普通员工访问无权限的 Server Component 页面时，当前显示 Next 通用错误边界；没有数据泄露，但后续应改为明确的 403 页面。
- 用户列表仍使用 OFFSET 深分页；数据量增长前改为稳定 keyset pagination。
