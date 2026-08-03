# AI 助理浏览器验收

## 验收入口

```bash
sh docs/testing/run-assistant-experience-e2e.sh
```

该 runner 默认使用隔离 Compose 项目 `aap-assistant-e2e`。需要避免项目名冲突时，可以使用同前缀的独立项目：

```bash
AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT=aap-assistant-e2e-local \
  sh docs/testing/run-assistant-experience-e2e.sh
```

脚本在构建前原子取得固定项目锁和全局 `8080` 端口锁，拒绝接管已有容器、卷、网络、项目镜像或被占用的端口。只有本次运行持有的 owner token 未被替换，退出 trap 才执行自有项目的 `down --rmi local -v --remove-orphans`；令牌不匹配时拒绝清理并保留现场供人工核查。项目名只接受 `aap-assistant-e2e` 或安全字符构成的同前缀后缀。

`.env.e2e` 中的本地凭据和交给 Compose 的数据库、认证、AgentOS、Assistant secret 文件，除 MIGRATOR、RUNTIME、BACKUP 三类 initdb role password 外，默认以 `0600` 处理，不输出 secret。这三类文件自物化起临时使用 `0644`，贯穿 Compose config/build 与数据库初始化；它们位于私有 `0700` 临时目录、容器内只读挂载，数据库 ready 后立即收紧为 `0600`。临时目录带独立 owner token，清理仅作用于本次创建的已知文件，不对任意路径做递归删除。Dockerfile 的 pnpm store 使用 BuildKit 内容寻址缓存，既不缓存项目 secret，也不改变锁文件校验。

默认运行完整 Experience 套件。需要只复现某条 Experience 用例时，可安全传入 Playwright grep：

```bash
AAP_ASSISTANT_EXPERIENCE_E2E_GREP='workspace changes its conversation rail' \
  sh docs/testing/run-assistant-experience-e2e.sh
```

该变量只作为单个 `--grep` 参数透传；未设置时仍运行完整套件。

## 当前自动验证范围

runner 同时运行 `e2e/assistant-experience.spec.ts` 与 `e2e/pricing-assistant.spec.ts`，并固定 `--workers=1`。两个浏览器项目共用隔离代理、限流桶和数据库 fixture，串行执行避免真实助手请求互相竞争。

当前生产可达路径是 Header 与 Quick 两个入口进入 `/assistant` workspace，而不是 Dock：

- Header 的键盘操作导航到 `/assistant`，并可将焦点交给 workspace composer；测试同时确认可见焦点样式。
- Quick 可打开、关闭、选择预设并显示安全服务状态；从 Quick 展开后进入 `/assistant` workspace。
- Quick 与 workspace 在展开过程中保留同一草稿、消息和进行中的单次请求，覆盖会话连续性。
- workspace 在精确 `721px ↔ 720px` 断点切换 conversation rail，不以遗留的 Dock separator 作为断言对象。
- 移动端覆盖 Quick 展开后的页面滚动、缩窄 viewport 后 composer 可用、输入区适配及无横向溢出。
- 覆盖认证与管理员受保护操作、价格计算、助手预设、安全建议动作、客户端路由会话边界，以及 pricing/assistant API 的不支持方法处理。
- 覆盖键盘可见焦点；原始附件 file input 标记为不可访问且不纳入移动端可交互控件尺寸检查，用户可见的附件按钮仍受尺寸与可用性约束。
- 采集 console、page error、request failure 和意外 `404/429/5xx`；仅对白名单中的占位服务或限流响应放行。

## 诚实边界

`AssistantDock` 当前不是生产可达路径。因此本 runner 不声明覆盖 Dock 拖拽、宽度持久化、遮罩、Escape 关闭、separator 断点、移动全屏或 `localStorage` 宽度恢复。`AssistantDock` 及 `useAssistantDockSize` 仍有组件/Hook 单测，但这些不是本 runner 的端到端证据。

同样，本 runner 的通过只表示本机隔离 Compose 环境中的 Experience 验收通过；不表示 GitHub 或其他远端 CI 已通过。assistant-runtime 的动态模型、重建与恢复由独立 runtime runner 验证，不记入本文件的 Experience 计数。

## 最新真实运行记录

- 2026-08-03：以隔离项目 `aap-assistant-e2e-localdiagnostic` 执行完整 Experience runner，结果为 `20 passed / 4 skipped / 0 failed`，退出码 `0`。
- 本轮仅记录 Experience runner 的结果；assistant-runtime 已另行验证，未混入以上计数。
