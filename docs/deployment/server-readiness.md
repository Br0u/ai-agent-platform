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
- `proxy`、`web`、`db`、`backup` 四个服务
- PostgreSQL 数据卷、上传文件卷与应用镜像分离
- 每日数据库备份，保留 7 至 30 天，并复制到另一台机器或备份存储

## 已实现的容器基线

- `proxy`：Nginx，仅对外发布`8080`，生产环境可映射到公司负载均衡或边缘Nginx。
- `web`：Next.js standalone，非root用户、只读文件系统，不直接发布主机端口。
- `db`：PostgreSQL 18，只有内部网络可访问，数据持久化到独立卷。
- `backup`：按周期执行`pg_dump`，写入独立备份卷并清理过期文件。
- `db`和`web`均有健康检查；后续服务按`service_healthy`顺序启动。

## 反向代理信任边界

仅当 Nginx 是 Web 服务的唯一入口、Web 不发布主机端口，并且 Nginx 使用连接来源覆盖 `X-Real-IP` 与 `X-Forwarded-For` 时，才可设置 `TRUST_NGINX_PROXY=true`。Compose 基线满足该条件：只有 `proxy` 发布端口，`web` 仅在内部 `frontend` 网络暴露。

非 Compose 部署必须提供等价的防火墙、容器网络或安全组规则，禁止客户端直连 Web origin。应用只能解释代理写入的请求头，应用无法验证 TCP 直连来源，因此不能用应用层配置替代网络隔离。

## 首次部署

```bash
cp .env.example .env
# 修改.env中的数据库密码和DATABASE_URL，两处密码必须一致
docker compose config
docker compose build web
docker compose up -d
docker compose ps
```

验收：

```bash
curl -f http://127.0.0.1:8080/api/health/live
curl -f http://127.0.0.1:8080/api/health/ready
```

当前首版SQL会在全新数据库卷初始化时自动执行。已有数据库的后续版本升级不能依赖`docker-entrypoint-initdb.d`，上线业务功能前必须补充独立迁移任务和回滚流程。

## 生产环境仍需补齐

- 公司域名、DNS、HTTPS证书及TLS终止位置。
- 正式镜像仓库、CI/CD发布账号和不可变镜像标签。
- 生产密钥管理；禁止把`.env`提交到Git。
- PostgreSQL备份的异机复制、加密、恢复演练与负责人。
- 容器日志采集、监控告警、磁盘水位和健康检查告警。
- 后续数据库迁移任务、变更审批和回滚预案。
- 管理员初始账号的安全创建流程；不得内置默认密码。

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
