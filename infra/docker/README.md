# infra/docker

目标部署拓扑：`proxy + web + agent + db + backup`。采用 Docker Compose 单机部署作为一期基线，代码镜像与数据卷分离。

生产启动顺序固定为：`db → migrate → agno-bootstrap → agent-migrate → agent → web → proxy/backup`。其中`migrate`负责平台 schema，`agno-bootstrap`负责既有卷也必须执行的 Agno 角色/schema 幂等升级，`agent-migrate`负责 Agno 自有迁移；`backup`必须等待两类迁移成功，避免生成缺少`agno`schema 的 dump。

备份只有一条原子写入路径：只读备份角色通过临时`PGPASSFILE`把`public`、`drizzle`、`agno`写入 tmpfs custom-format 文件，随后使用标准 OpenPGP 对称加密（AES256、iterated/salted S2K mode 3、SHA-512、count 65011712、强制 MDC），成功后才把`0600`的`.dump.gpg`原子改名到备份卷。`BACKUP_ENCRYPTION_KEY_FILE`必须指向独立、已忽略的`0600`外部密钥文件，内容恰好一行、无空白或 CR、至少 32 字节，可有一个结尾换行。生产必须将加密文件复制到异机存储；不要在同一数据库旁保存唯一副本。
