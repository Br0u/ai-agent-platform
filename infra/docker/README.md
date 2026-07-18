# infra/docker

目标部署拓扑：`proxy + web + agent + db + backup`。采用 Docker Compose 单机部署作为一期基线，代码镜像与数据卷分离。

生产启动顺序固定为：`db → migrate / agno-bootstrap → agent-migrate / agent-control-bootstrap → agent-control-migrate → agent → web → proxy/backup`。`migrate`负责平台 schema；`agno-bootstrap`与`agent-migrate`分别负责 Agno 最小权限角色和 schema；`agent-control-bootstrap`在 Agno 角色就绪后创建动态模型控制面的独立角色，`agent-control-migrate`负责`agent_control`schema。Agent 必须同时等待 Agno 与控制面迁移完成，运行时只持有各自 runtime URL，不持有 migrator 凭据。

`ai_agent_control_migrator`拥有`agent_control`schema 和表，`ai_agent_control`只获得运行所需的`SELECT/INSERT/UPDATE`权限。`AGENT_ENABLED=true`只负责注册码多多并启用动态模型控制面，启动时不要求 Provider、Model ID 或模型 Key；部署环境中的完整 Provider/Model/Key 仅是可选、只读的 bootstrap/fallback。一旦存在动态活动配置，动态配置优先，加载失败也不会静默回退。自定义模型 Endpoint 只能编辑`infra/agent/model-endpoints.json`后重建 Agent 镜像；目录以 root `0644`复制到只读容器，Web 不持有目录或模型 Endpoint。

备份只有一条原子写入路径：只读备份角色通过临时`PGPASSFILE`把`public`、`drizzle`、`agno`写入 tmpfs custom-format 文件，随后使用标准 OpenPGP 对称加密（AES256、iterated/salted S2K mode 3、SHA-512、count 65011712、强制 MDC），成功后才把`0600`的`.dump.gpg`原子改名到备份卷。备份服务有意不挂载任何`agent_control`数据库 URL、角色密码、模型加密 Key 或内部 control Key；恢复后需按上述控制面 bootstrap/migration 顺序重建并重新配置动态模型。`BACKUP_ENCRYPTION_KEY_FILE`必须指向独立、已忽略的`0600`外部密钥文件，内容恰好一行、无空白或 CR、至少 32 字节，可有一个结尾换行。生产必须将加密文件复制到异机存储；不要在同一数据库旁保存唯一副本。
