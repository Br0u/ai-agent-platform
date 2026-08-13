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

若默认端口 `8080` 已占用，可为本次隔离验收选择已确认空闲的宿主端口：

```bash
ASSISTANT_EXPERIENCE_E2E_HTTP_PORT=18082 \
  AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT=aap-assistant-e2e-local \
  sh docs/testing/run-assistant-experience-e2e.sh
```

脚本在构建前原子取得固定项目锁和按宿主端口隔离的端口锁，拒绝接管已有容器、卷、网络、项目镜像或被占用的端口。只有本次运行持有的 owner token 未被替换，退出 trap 才执行自有项目的 `down --rmi local -v --remove-orphans`；令牌不匹配时拒绝清理并保留现场供人工核查。项目名只接受 `aap-assistant-e2e` 或安全字符构成的同前缀后缀。

`.env.e2e` 中的本地凭据和交给 Compose 的数据库、认证、AgentOS、Assistant secret 文件，除 MIGRATOR、RUNTIME、BACKUP 三类 initdb role password 外，默认以 `0600` 处理，不输出 secret。这三类文件自物化起临时使用 `0644`，贯穿 Compose config/build 与数据库初始化；它们位于私有 `0700` 临时目录、容器内只读挂载，数据库 ready 后立即收紧为 `0600`。临时目录带独立 owner token，清理仅作用于本次创建的已知文件，不对任意路径做递归删除。Dockerfile 的 pnpm store 使用 BuildKit 内容寻址缓存，既不缓存项目 secret，也不改变锁文件校验。

默认运行完整 Experience 套件。需要只复现某条 Experience 用例时，可安全传入 Playwright grep：

```bash
AAP_ASSISTANT_EXPERIENCE_E2E_GREP='workspace clears the current-page conversation' \
  sh docs/testing/run-assistant-experience-e2e.sh
```

该变量只作为单个 `--grep` 参数透传；未设置时仍运行完整套件。

## 当前自动验证范围

runner 同时运行 `e2e/assistant-experience.spec.ts` 与 `e2e/pricing-assistant.spec.ts`，并固定 `--workers=1`。两个浏览器项目共用隔离代理、限流桶和数据库 fixture，串行执行避免真实助手请求互相竞争。

当前生产可达路径是 Header 与 Quick 两个入口进入 `/assistant` workspace，而不是 Dock：

- Header 的键盘操作导航到 `/assistant`，并可将焦点交给 workspace composer；测试同时确认可见焦点样式。
- Quick 可打开、关闭、选择预设并显示安全服务状态；从 Quick 展开后进入 `/assistant` workspace。
- `workspace clears the current-page conversation` 验证草稿和消息只存在于当前 pathname 的 React 内存；跳转进入 workspace 或刷新后立即清空。
- `workspace has no conversation rail at any responsive breakpoint` 在 `721px` 与 `720px` 都验证不存在 complementary rail、`CONVERSATIONS` 和“新建会话”。
- Quick 的三个常见问题必须处于同一横向 chip strip；提交第一条消息后整组隐藏，不占用消息阅读区域。
- V2 stream 的当前 activity 在工作中以唯一 `aria-live` 状态展示，完成后转为默认收起的原生 `details` 审计轨迹；Markdown 链接只显示文字，导航只能通过明确的 action button 点击触发。
- 移动端覆盖 Quick 展开后的页面滚动、缩窄 viewport 后 composer 可用、输入区适配及无横向溢出。
- 覆盖认证与管理员受保护操作、价格计算、助手预设、安全建议动作、客户端当前页面边界，以及 pricing/assistant API 的不支持方法处理。`390px` 与 reduced-motion 项目还验证无横向溢出；Orb 的 `breathing`、`searching`、`solving`、`working` 四种映射状态均通过原生 Canvas 绘制计数证明静止。
- desktop 真实浏览器通过原生 Canvas 绘制计数验证 Orb 离开视口后停止、回到视口后恢复；页面隐藏分支由实际 `thinking-orbs` 依赖的原生 `visibilitychange` 监听测试验证 cancel/resume。当前自动化 Chromium 无法产生真实 `document.visibilityState=hidden`，因此不把人工派发事件包装成浏览器 PASS。
- 覆盖键盘可见焦点；原始附件 file input 标记为不可访问且不纳入移动端可交互控件尺寸检查，用户可见的附件按钮仍受尺寸与可用性约束。
- 采集 console、page error、request failure 和意外 `404/429/5xx`；仅对白名单中的占位服务或限流响应放行。

## 诚实边界

`AssistantDock` 当前不是生产可达路径。因此本 runner 不声明覆盖 Dock 拖拽、宽度持久化、遮罩、Escape 关闭、separator 断点、移动全屏或 `localStorage` 宽度恢复。`AssistantDock` 及 `useAssistantDockSize` 仍有组件/Hook 单测，但这些不是本 runner 的端到端证据。

同样，本 runner 的通过只表示本机隔离 Compose 环境中的 Experience 验收通过；不表示 GitHub 或其他远端 CI 已通过。assistant-runtime 的动态模型、重建与恢复由独立 runtime runner 验证，不记入本文件的 Experience 计数。

## 真实运行记录

- 2026-08-13：以隔离项目 `aap-assistant-e2e-final` 执行完整 Experience runner，结果为 `21 passed / 5 project-conditional skipped / 0 failed`，退出码 `0`。exact 8 图 manifest 位于本地 `artifacts/playwright/assistant-experience/aap-assistant-e2e-final-c01a20eb9f1a19d4dc6a3b9021f91dd6/attachments-manifest.json`。
- 当前总体验收为 PARTIAL：page-hidden Orb 的真实浏览器证据仍 BLOCKED；上述依赖边界 cancel/resume 测试不能替代浏览器 PASS。assistant-runtime 已由独立 runner 验证，不混入以上 Experience 计数。
- 历史记录：2026-08-03，隔离项目 `aap-assistant-e2e-localdiagnostic` 为 `20 passed / 4 skipped / 0 failed`，退出码 `0`。
