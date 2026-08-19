# infra/nginx

预留 Nginx/Caddy 反向代理配置，负责 80/443、TLS、请求体限制、超时、限流和安全响应头。Next.js 容器不直接暴露公网端口。代理必须用连接来源覆盖 `X-Real-IP` 和 `X-Forwarded-For`，不能转发客户端提供的同名值。

全局请求体上限固定为 10 MiB。只有 `POST /api/v1/admin/downloads/{uuid}/upload/document`、`windows`、`macos` 三个精确 slot 路由使用 1025 MiB、关闭请求/响应缓冲，并将 client body、proxy send、proxy read timeout 均设为 3600 秒；该 location 仍只允许 POST 并保留可信代理头。旧 `/upload`、非法 UUID 或 slot 继续落到全局 10 MiB，PUT 仍由 `limit_except` 返回 403。
