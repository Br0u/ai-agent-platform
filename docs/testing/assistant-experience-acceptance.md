# AI 助理三形态浏览器验收

## 验收入口

```bash
sh docs/testing/run-assistant-experience-e2e.sh
```

脚本默认使用隔离 Compose 项目 `aap-assistant-e2e`。需要保留失败现场或避免项目名冲突时，可以使用同前缀的独立项目：

```bash
AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT=aap-assistant-e2e-task9 \
  sh docs/testing/run-assistant-experience-e2e.sh
```

脚本在构建前原子取得位于 `/tmp` 的固定项目锁和全局 `8080` 端口锁，并拒绝接管已有容器、卷、网络、项目镜像或已被占用的端口。锁不依赖 `TMPDIR`，因此同一 Compose 项目从不同临时目录启动时仍会串行；不同项目也会因共享全局 `8080` 锁而串行，后启动的并发任务会被明确拒绝。只有本次运行持有的两个 `0600` owner token 都未被替换，退出 trap 才执行一次 `down --rmi local -v --remove-orphans`；令牌不匹配时拒绝清理并保留现场供人工核查。

可配置项目名用于保留某次失败现场或避免项目名冲突，但仅接受 `aap-assistant-e2e` 或带安全字符后缀的同前缀名称，避免 shell 与路径注入。`.env.e2e` 是脚本生成或复用的本地凭据源，始终验证并收紧为 `0600`，不会输出内容；数据库、认证、AgentOS 和 Assistant 密钥在交给 Compose 前统一物化为临时 `0600` secret 文件，不进入命令参数。临时目录带独立 owner token，退出时只删除本次运行创建的已知文件并使用 `rmdir` 收口，不会对任意路径执行递归删除。Dockerfile 的 pnpm store 使用 BuildKit 内容寻址缓存，目的是让 registry 中断后能够复用已校验包，不缓存项目 secret，也不改变锁文件校验。

所有权只会在锁、同名资源、端口、secret 和 `docker compose config --quiet` 全部通过后取得。在此之前任何失败都不会调用 `docker compose down`；取得所有权后的 build、up、Playwright 或正常退出则恰好清理一次。缺少 `lsof` 时脚本按失败关闭处理，不会猜测端口是否空闲。

## 自动验证范围

- 同时运行 `e2e/assistant-experience.spec.ts` 与 `e2e/pricing-assistant.spec.ts`，不会遗漏旧价格计算验收。
- 顶部入口打开右侧 Dock；桌面默认宽度为 `480px`，拖拽边界为 `380–760px`，键盘方向键可调整。
- 只有正常 pointer up 和键盘调整写入宽度偏好；pointer cancel 不写入，刷新恢复最近一次主动宽度。
- Quick → Dock → `/assistant` 共用草稿、消息和进行中的单次请求；Dock 可收起为 Quick。
- 遮罩与 Escape 可关闭 Dock，并把焦点还给原入口；任意时刻只有一个 dialog。
- `390×844` 下 Dock 全屏且无 separator；缩小 viewport 模拟软键盘后输入区仍在可视范围，消息区可滚动且页面无横向溢出。
- 采集所有 console 类型、page error、request failure 和意外 `404/429/5xx`；只对白名单内的占位服务或限流响应放行。
- 继续覆盖价格计算、登录/注册、管理员助手及客户端路由中的助手会话回归。

## 最新真实运行记录

- 部署契约：`38/38` 通过，其中 fake Docker/pnpm/openssl/lsof harness 在 CI 可直接执行，不依赖本机 Docker。
- 可执行安全分支覆盖：同一项目跨不同 `TMPDIR` 的固定锁、不同项目争用全局 `8080` 锁、已有容器/卷/网络/项目镜像、缺少 `lsof`、端口占用、secret 创建失败和 compose config 失败均为 `down 0`；取得所有权后的 build/up/后续失败与成功均为 `down 1`。替换 owner token 后同样为 `down 0` 并保留被篡改锁；正常路径的临时 secret 和自有锁无残留。
- Playwright：两个 spec、两个项目共发现 `22` 个用例。
- 完整 runner 两次使用官方 npm registry 构建，分别在 `937/943`、`935/943` 个依赖下载后因网络超时退出，均未进入 Playwright；镜像源复核同样返回连接重置，因此没有继续盲目重试。
- 每次失败后的独立项目容器、卷、网络、项目镜像、锁和临时 secret 均为 `0` 残留。
- 转为本机已安装依赖后，production standalone 构建成功，`38/38` 个静态页面生成。
- standalone 服务在 `127.0.0.1:3100` 上完成本任务新增的三条关键浏览器验收：桌面伸缩与偏好持久化、Quick → Dock → 独立页单请求连续性、移动端全屏与软键盘可见性，结果为 `3 passed, 3 skipped`（按项目视口跳过不适用用例）。
- 旧的快捷问答预设依赖 E2E PostgreSQL fixture；单独启动无数据库的 standalone 时按设计返回 `503`，不作为本地 standalone 通过项。完整数据库/认证/价格计算回归仍以可联网环境中的隔离 runner 为准。
