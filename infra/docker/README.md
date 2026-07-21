# infra/docker

目标部署拓扑：`proxy + web + agent + db + backup`。采用 Docker Compose 单机部署作为一期基线，代码镜像与数据卷分离。

生产启动顺序固定为：`db → migrate / agno-bootstrap → agent-migrate / agent-control-bootstrap / skill-registry-bootstrap → agent-control-migrate / skill-registry-migrate → agent / skill-registry → web → proxy/backup`。`migrate`负责平台 schema；`agno-bootstrap`与`agent-migrate`分别负责 Agno 最小权限角色和 schema；`agent-control-bootstrap`在 Agno 角色就绪后创建动态模型控制面的独立角色，`agent-control-migrate`负责`agent_control`schema；`skill-registry-bootstrap`与`skill-registry-migrate`创建 Registry 最小权限角色和长期 schema。Agent 与 Skill Registry 运行时只持有各自 runtime URL，不持有 migrator 凭据。

`ai_agent_control_migrator`拥有`agent_control`schema 和表，`ai_agent_control`只获得运行所需的`SELECT/INSERT/UPDATE`权限。`AGENT_ENABLED=true`只负责注册码多多并启用动态模型控制面，启动时不要求 Provider、Model ID 或模型 Key；部署环境中的完整 Provider/Model/Key 仅是可选、只读的 bootstrap source。一旦存在动态活动配置，动态配置优先，加载失败时 fail closed，不静默回退部署 bootstrap。自定义模型 Endpoint 只能编辑`infra/agent/model-endpoints.json`后重建 Agent 镜像；目录以 root `0644`复制到只读容器，Web 不持有目录或模型 Endpoint。

备份只有一条原子写入路径：只读备份角色开启受超时保护的`REPEATABLE READ READ ONLY`事务，在同一导出 snapshot 中读取 Skill Registry 状态、数据库大小估算并执行一次`pg_dump`，把`public`、`drizzle`、`agno`、`skill_registry`写入 custom-format dump。`BACKUP_DUMP_TIMEOUT_SECONDS=3600`限制 dump 运行时间，超时先发 TERM，`BACKUP_DUMP_KILL_AFTER_SECONDS=5`后仍未退出则发 KILL；`BACKUP_SNAPSHOT_TIMEOUT_SECONDS=3665`限制 snapshot exporter 总生命周期，并且必须至少比 dump 上限与 KILL 宽限之和长 60 秒，避免两者同时超时。`BACKUP_PROCESS_KILL_AFTER_SECONDS=5`和`BACKUP_ENCRYPT_TIMEOUT_SECONDS=3600`/`BACKUP_ENCRYPT_KILL_AFTER_SECONDS=5`约束 exporter 与加密进程组，TERM 宽限后整组 KILL 并回收。Compose 默认`BACKUP_TMPFS_SIZE=1g`，启动 dump 前要求可用临时空间不少于数据库估算加`BACKUP_SPACE_SAFETY_BYTES=67108864`；数据库超过该预算时必须先扩 tmpfs，不能等写满后失败。超时或容量不足会关闭 FIFO、回收 exporter 并删除所有明文中间文件，只输出固定错误。固定格式 manifest 记录 bundle 格式版本、dump SHA-256，以及 schema version、revision/artifact/file 的源端计数；`tar`输出直接流入 GPG，不再生成第二份明文 tar。OpenPGP 使用 AES256、iterated/salted S2K mode 3、SHA-512、count 65011712 和强制 MDC；密文临时文件先`fsync`，原子改名后再`fsync`备份目录。`skill_registry`保存长期、不可变的 Skill 审核证据，不能从备份中排除。Registry 计数来自加密 bundle 内、与 dump 同一导出 snapshot 的 manifest，不再由操作者输入；恢复后必须逐项与数据库比较，并在 PostgreSQL 内验证每个 archive 的 SHA-256，只输出计数和固定状态，不输出 archive、文件源码或拒绝原因全文。空 Registry 使用显式计数`0/0/0`，非空 Registry 记录同一 snapshot 的准确计数；任一 manifest、dump digest、行数、关系或安全 trigger 不一致都必须让演练失败。新备份只支持该 bundle 格式，不把无 manifest 的旧 raw dump 静默当作新格式恢复。

`agent_control`仍是短生命周期控制面，不进入备份。备份服务有意不挂载任何`agent_control`数据库 URL、角色密码、模型加密 Key 或内部 control Key；恢复后需按上述控制面 bootstrap/migration 顺序重建并重新配置动态模型。`BACKUP_ENCRYPTION_KEY_FILE`必须指向独立、已忽略的`0600`外部密钥文件，内容恰好一行、无空白或 CR、至少 32 字节，可有一个结尾换行。生产必须将加密文件复制到异机存储；不要在同一数据库旁保存唯一副本。

恢复测试只允许使用隔离数据库、临时目录和测试 Secret。执行前准备`0600`普通文件`BACKUP_DATABASE_PASSWORD_FILE`与`BACKUP_ENCRYPTION_KEY_FILE`，设置测试镜像`BACKUP_CRYPTO_IMAGE`、`RESTORE_SKILL_REGISTRY_IMAGE`和隔离临时根`RESTORE_TMP_ROOT`。解密前用`RESTORE_MAX_ENCRYPTED_BYTES=2147483648`限制密文；恢复根可用空间必须覆盖密文、两倍解密上限以及`RESTORE_SPACE_SAFETY_BYTES=67108864`安全余量，不足时在创建 Docker 容器前固定失败。解密先执行受`RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS=30`约束的命名`docker create`，再用 exact-name `docker ps -a`查询确认名称存在，之后才执行受`RESTORE_DECRYPT_TIMEOUT_SECONDS=3600`约束的`docker start --attach`；查询只有命令成功且输出严格等于名称才算存在，成功空输出连续确认两次才算不存在，超时、非零或意外输出一律为 UNKNOWN。宿主监督器只使用已探测可用的`sh`、`kill`、`wait`和`sleep 0.1`，不依赖 GNU timeout 或 setsid。每个 Docker CLI 超时先 TERM，`RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS=2`后 KILL 并 wait；decrypt stop/rm/query 及数据库容器、卷的 rm/query 单次上限均为`RESTORE_DOCKER_CLI_TIMEOUT_SECONDS=10`，共用同一状态机，最多`RESTORE_DECRYPT_RECONCILE_ATTEMPTS=3`轮；UNKNOWN 持续到上限时保留原失败或 signal 状态，并额外输出固定`restore drill cleanup failed`，不打印 Docker 诊断。解密容器 stop 的宽限仍为`RESTORE_DECRYPT_KILL_AFTER_SECONDS=5`。GPG 与`head`限流只在容器内运行，输出只写独立 bind mount，硬限制为`RESTORE_MAX_DECRYPTED_BYTES=4294967296`加 1 字节，不向宿主 stdout/stderr 转发 archive 或源码。Skill Registry schema 会向控制面角色授权，因此`skill-registry-bootstrap`显式等待`agent-control-bootstrap`；恢复保留 dump 的 owner/ACL，前后都执行仓库现有`01/03/04/05`角色 bootstrap，再用实际 Skill Registry 镜像运行`python -m skill_registry.migrate`。迁移验证只兼容 PostgreSQL 18 对同一 review evidence 数组 cast 的两种已知等价反解析，其他约束定义漂移继续 fail closed。最后分别用 manager、backup、runtime 通过 TCP 登录；正向 SQL 必须真实执行，反向 SQL 必须返回`42501 permission denied`，不能把语法或连接失败算作权限隔离成功。Registry version/revision/artifact/file 计数由加密 manifest 提供；命令行只传 users、Agno session 的源端计数及固定 fixture ID：

```sh
BACKUP_ENCRYPTION_KEY_FILE=/secure/test-secrets/backup_encryption_key \
BACKUP_CRYPTO_IMAGE=ai-agent-platform-backup:tested \
RESTORE_SKILL_REGISTRY_IMAGE=ai-agent-platform-skill-registry:tested \
RESTORE_TMP_ROOT=/secure/test-tmp \
infra/docker/restore-drill.sh \
  /secure/path/ai-agent-platform-YYYYMMDDTHHMMSSZ.dump.gpg \
  EXPECTED_USERS EXPECTED_AGNO_SESSIONS USER_FIXTURE_ID AGNO_SESSION_FIXTURE_ID
```

每次 Compose 启动前必须执行`pnpm secrets:preflight`；不得用软链接、目录、FIFO、宽于`0600`的宿主 Secret，亦不得绕过`run-with-secret-env.sh`的容器内`0600`检查。演练退出后确认快照事务、FIFO、manifest、dump、bundle、容器和卷均已删除。密钥轮换必须保留能解密历史备份的受控旧版本，并用新旧密钥分别做隔离恢复后再停用旧密钥；README 和测试配置中禁止放真实凭据。`docs/testing/run-agentos-backup-restore.sh`将在 Task 10 适配新 bundle；完成前不得把该旧脚本的失败解释为新 bundle 已通过完整验收。
