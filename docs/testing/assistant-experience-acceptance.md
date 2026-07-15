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
- 两个浏览器项目共用同一隔离反向代理、IP 限流桶和数据库 fixture，因此 runner 固定使用 `--workers=1` 串行执行真实助手请求，避免测试自竞争；不会用 mock 或放宽断言代替真实链路。
- 顶部入口打开右侧 Dock；桌面默认宽度为 `480px`，拖拽边界为 `380–760px`，键盘方向键可调整。
- 只有正常 pointer up 和键盘调整写入宽度偏好；pointer cancel 不写入，刷新恢复最近一次主动宽度。
- 已打开的 Dock 在精确 `721→720→721` 断点切换中保持单一 dialog：`721px` 恢复 separator 与原桌面宽度偏好，`720px` 全屏、无 separator 且继续锁定背景滚动；移动全屏不会覆盖 `localStorage` 中的桌面宽度偏好。
- Quick → Dock → `/assistant` 共用草稿、消息和进行中的单次请求；从完整页点击真实品牌首页入口返回门户后，surface 关闭但会话不丢失，重新打开 Quick/Dock 不会重复请求。
- 遮罩与 Escape 可关闭 Dock，并把焦点还给原入口；任意时刻只有一个 dialog。
- `390×844` 下 Dock 全屏且无 separator；缩小 viewport 模拟软键盘后输入区仍在可视范围，消息区可滚动且页面无横向溢出。
- 采集所有 console 类型、page error、request failure 和意外 `404/429/5xx`；只对白名单内的占位服务或限流响应放行。
- 继续覆盖价格计算、登录/注册、管理员助手及客户端路由中的助手会话回归。

## 最新真实运行记录

- 部署契约：`39/39` 通过，其中 fake Docker/pnpm/openssl/lsof harness 在 CI 可直接执行，不依赖本机 Docker。
- 可执行安全分支覆盖：同一项目跨不同 `TMPDIR` 的固定锁、不同项目争用全局 `8080` 锁、已有容器/卷/网络/项目镜像、缺少 `lsof`、端口占用、secret 创建失败和 compose config 失败均为 `down 0`；取得所有权后的 build/up/后续失败与成功均为 `down 1`。替换 owner token 后同样为 `down 0` 并保留被篡改锁；正常路径的临时 secret 和自有锁无残留。
- Playwright：两个 spec、两个项目在提交 `7bf0b63` 的完整隔离 runner 中为 `19 passed / 3 expected skipped / 0 failed`，production standalone 构建生成 `38/38` 个页面。
- `c6e0109` 已将 Dockerfile 的 pnpm store 改为 BuildKit 内容寻址缓存并加入有界网络重试；后续 migrate/web 依赖安装层均命中 `CACHED`，此前 registry 中断导致 runner 未进入 Playwright 的问题已关闭，不再作为当前限制。
- `7bf0b63` 完整 runner 退出后，隔离项目容器、卷、网络、项目镜像、锁和临时 secret 均为 `0` 残留；全局 `8080` 端口已释放，原有默认 E2E 镜像 ID 未变化。
- 最终规格复审新增精确断点恢复和完整页返回门户连续性后，Playwright 清单为 `24` 个用例；并行预跑已证明新增用例通过，但旧价格咨询流程会因共享 IP 限流桶与数据库 fixture 自竞争，因此完整 runner 已固定串行执行，最终结果在本轮验证完成后更新。
