# infra/docker

目标部署拓扑：`proxy + web + agent + db + backup`。采用 Docker Compose 单机部署作为一期基线，代码镜像与数据卷分离。

生产启动顺序固定为：`db → migrate / agno-bootstrap → agent-migrate / agent-control-bootstrap / skill-registry-bootstrap → agent-control-migrate / skill-registry-migrate → agent / skill-registry → web → proxy/backup`。`migrate`负责平台 schema；`agno-bootstrap`与`agent-migrate`分别负责 Agno 最小权限角色和 schema；`agent-control-bootstrap`在 Agno 角色就绪后创建动态模型控制面的独立角色，`agent-control-migrate`负责`agent_control`schema；`skill-registry-bootstrap`与`skill-registry-migrate`创建 Registry 最小权限角色和长期 schema。Agent 与 Skill Registry 运行时只持有各自 runtime URL，不持有 migrator 凭据。

`ai_agent_control_migrator`拥有`agent_control`schema 和表，`ai_agent_control`只获得运行所需的`SELECT/INSERT/UPDATE`权限。`AGENT_ENABLED=true`只负责注册码多多并启用动态模型控制面，启动时不要求 Provider、Model ID 或模型 Key；部署环境中的完整 Provider/Model/Key 仅是可选、只读的 bootstrap source。一旦存在动态活动配置，动态配置优先，加载失败时 fail closed，不静默回退部署 bootstrap。自定义模型 Endpoint 只能编辑`infra/agent/model-endpoints.json`后重建 Agent 镜像；目录以 root `0644`复制到只读容器，Web 不持有目录或模型 Endpoint。

备份只有一条原子写入路径：只读备份角色通过临时`PGPASSFILE`把`public`、`drizzle`、`agno`、`skill_registry`写入 tmpfs custom-format 文件，随后使用标准 OpenPGP 对称加密（AES256、iterated/salted S2K mode 3、SHA-512、count 65011712、强制 MDC），成功后才把`0600`的`.dump.gpg`原子改名到备份卷。`skill_registry`保存长期、不可变的 Skill 审核证据，不能从备份中排除；恢复演练必须比较 schema version、revision/artifact/file 的源端计数，并在 PostgreSQL 内验证每个 archive 的 SHA-256，只输出计数和固定状态，不输出 archive、文件源码或拒绝原因全文。空 Registry 使用显式计数`0/0/0`，非空 Registry 使用备份前记录的准确计数；任一 digest 或关系校验不一致都必须让演练失败。

`agent_control`仍是短生命周期控制面，不进入备份。备份服务有意不挂载任何`agent_control`数据库 URL、角色密码、模型加密 Key 或内部 control Key；恢复后需按上述控制面 bootstrap/migration 顺序重建并重新配置动态模型。`BACKUP_ENCRYPTION_KEY_FILE`必须指向独立、已忽略的`0600`外部密钥文件，内容恰好一行、无空白或 CR、至少 32 字节，可有一个结尾换行。生产必须将加密文件复制到异机存储；不要在同一数据库旁保存唯一副本。

恢复测试只允许使用隔离数据库、临时目录和测试 Secret。执行前准备`0600`普通文件`BACKUP_DATABASE_PASSWORD_FILE`与`BACKUP_ENCRYPTION_KEY_FILE`，设置测试镜像`BACKUP_CRYPTO_IMAGE`和隔离临时根`RESTORE_TMP_ROOT`，并向`restore-drill.sh`传入源端 users、Agno session、Skill Registry version/revision/artifact/file 计数及固定 fixture ID；前五个参数之后的 Registry 参数省略时仅表示 version `1`且三张数据表均为空。每次 Compose 启动前必须执行`pnpm secrets:preflight`；不得用软链接、目录、FIFO、宽于`0600`的宿主 Secret，亦不得绕过`run-with-secret-env.sh`的容器内`0600`检查。演练退出后确认临时明文、容器和卷均已删除。密钥轮换必须保留能解密历史备份的受控旧版本，并用新旧密钥分别做隔离恢复后再停用旧密钥；README 和测试配置中禁止放真实凭据。
