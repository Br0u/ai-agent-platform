# 公司服务器准备清单

## 必须确认

- Linux 发行版与版本
- CPU 架构：x86_64 或 ARM64
- 单机或集群
- 是否允许访问互联网、npm 和 Docker Registry
- CPU、内存、磁盘及可用数据盘路径
- SSH 登录方式和部署账号
- 80/443 端口、防火墙、域名和 DNS 权限
- TLS 证书来源
- 是否已有 Nginx、Docker Engine、Docker Compose
- 日志、监控、备份目录和保留周期

## 一期基线

- 单台 Linux 服务器
- Docker Compose 部署
- 至少 4 核、8 GB 内存、100 GB 可用磁盘
- `proxy`、`web`、`migrate`、`db`、`backup` 五个服务
- PostgreSQL 数据卷、上传文件卷与应用镜像分离
- 每日数据库备份，保留 7 至 30 天，并复制到另一台机器或备份存储

## 已实现的容器基线

- `proxy`：Nginx，仅对外发布`8080`，生产环境可映射到公司负载均衡或边缘Nginx。
- `web`：Next.js standalone，非root用户、只读文件系统，不直接发布主机端口。
- `db`：PostgreSQL 18，只有内部网络可访问，数据持久化到独立卷。
- `migrate`：只使用 `ai_agent_migrator` 连接，完成迁移、权限种子和运行时授权后退出。
- `backup`：只使用独立的`ai_agent_backup`只读账号执行`pg_dump`，写入独立备份卷并清理过期文件。
- `db`和`web`均有健康检查；`migrate`等待`db`健康后执行，`web`和`backup`等待`migrate`成功退出，`proxy`等待`web`健康。

## 反向代理信任边界

仅当 Nginx 是 Web 服务的唯一入口、Web 不发布主机端口，并且 Nginx 使用连接来源覆盖 `X-Real-IP` 与 `X-Forwarded-For` 时，才可设置 `TRUST_NGINX_PROXY=true`。Compose 基线满足该条件：只有 `proxy` 发布端口，`web` 仅在内部 `frontend` 网络暴露。

非 Compose 部署必须提供等价的防火墙、容器网络或安全组规则，禁止客户端直连 Web origin。应用只能解释代理写入的请求头，应用无法验证 TCP 直连来源，因此不能用应用层配置替代网络隔离。

该拓扑只有一跳受控代理。Nginx 已把`X-Real-IP`和`X-Forwarded-For`覆盖为 TCP 连接来源，应用直接使用这个规范化结果，不再配置 Better Auth 的代理 CIDR 过滤。否则，真实客户端使用`172.16.0.0/12`等私网地址时会被误判成代理并共享限流桶。真实安全边界仍由`web`不发布端口、内部`frontend`网络以及 Nginx 覆盖转发头共同提供。

Nginx 启动必须显式提供`PUBLIC_HOST`，生产值填写外部 DNS 主机名，不含协议和端口。`ALLOW_LOCAL_VALIDATION_HOSTS`默认且在生产必须为`false`；只有本机验收时可显式设为`true`，此时才额外允许`localhost`、`127.0.0.1`和 IPv6 loopback。其他 Host 在转发前返回 421。获准请求仍把原始`Host`（含端口）转发给 Web。

## 首次部署

```bash
cp .env.example .env
# 分别生成 owner、migrator、runtime、backup 和 Better Auth 密钥；不要复用
# 生产 PUBLIC_HOST 必须改为对外域名
docker compose config
docker compose build migrate web
docker compose up -d --wait db migrate web proxy backup
docker compose ps
```

数据库角色分离：owner 只在新卷初始化时创建角色；migrator 只供迁移任务；runtime 只供 Web；backup 只供备份容器。backup 只有数据库 CONNECT、schema USAGE、当前和未来表/序列的 SELECT 权限，没有 CREATE 或数据写权限；`BACKUP_DATABASE_URL`不得提供给 Web。runtime 无 schema 变更权限，并被数据库显式拒绝修改或删除 `audit_logs`。`web` 没有主机端口，唯一入口是 Nginx `proxy`。

创建首位超级管理员：

```bash
docker compose run --rm -it migrate pnpm --filter @ai-agent-platform/database auth:create-super-admin
```

密码只通过 TTY 隐藏读取并二次确认。系统不创建默认账号；已有 `super_admin` 时命令安全失败，不能用作日常管理员创建接口。

验收：

```bash
curl -f -H "Host: ${PUBLIC_HOST}" http://127.0.0.1:8080/api/health/live
curl -f -H "Host: ${PUBLIC_HOST}" http://127.0.0.1:8080/api/health/ready
```

新数据库卷会初始化独立角色；后续 schema 由一次性 `migrate` 服务处理。已有数据库不能依赖 `docker-entrypoint-initdb.d`，切换前需由 DBA 手工建立等价角色和授权，并验证 runtime 无`CREATE`及 audit 更新/删除权限，同时验证 backup 只能读取、不能写入或建表。

## 认证入口限流

Nginx 仅对 `/login`、`/register`、`/staff/login`、`/staff/two-factor`、`/staff/re-auth` 的 POST 计数，速率为每 IP 每分钟 5 次并允许 5 次突发，超限返回 429，并附带`X-Auth-Rate-Limit: REJECTED`；GET 页面加载不计数。代理覆盖客户端提交的`X-Real-IP`和`X-Forwarded-For`，应用仍保留规范化账号/IP双层限流。

## 生产环境仍需补齐

- 公司域名、DNS、HTTPS证书及TLS终止位置。
- 正式镜像仓库、CI/CD发布账号和不可变镜像标签。
- 生产密钥管理；禁止把`.env`提交到Git。
- PostgreSQL备份的异机复制、加密、恢复演练与负责人。
- 容器日志采集、监控告警、磁盘水位和健康检查告警。
- 后续数据库迁移任务、变更审批和回滚预案。

## 离线环境

如果公司服务器不能访问外网：

1. 在构建机完成依赖安装和镜像构建。
2. 推送到公司私有镜像仓库，或导出离线镜像包。
3. 服务器只拉取/导入固定版本镜像，不在生产机执行 npm 安装。

## 上线门槛

- 健康检查通过
- 数据库迁移成功
- HTTPS 可用
- 管理后台不暴露默认密码
- 备份和恢复至少演练一次
- 容器可在重启后自动恢复
- 日志有轮转，磁盘空间有告警
- 上一个镜像版本可一键回滚
