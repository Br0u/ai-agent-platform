# AI 助理与企业壳层实施验收

日期：2026-07-13

## 验收范围

- 门户顶栏莫比乌斯入口、浮动 M 入口与共享抽屉。
- `/assistant` 独立工作区。
- `/admin/assistant` 受保护运营页。
- 客户登录、客户注册、员工登录及员工安全流程。
- 1440×1000 桌面视口与 390×844 移动视口。
- reduced-motion、键盘焦点、横向溢出、控制台错误与本地静态资产。

## 自动化门禁

实施前按顺序运行：

```text
pnpm --filter @ai-agent-platform/ui test
pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/database test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

最终结果：UI 75 passed；Web 754 passed / 35 skipped；Database 104 passed / 12 skipped；typecheck、lint、format、build 均 exit 0。Database skipped 项为未提供 `TEST_DATABASE_URL` 的破坏性集成测试，Docker E2E 使用独立数据库补足浏览器链路验收。

## 浏览器与容器证据

通过唯一入口执行：

```text
sh docs/testing/run-assistant-experience-e2e.sh
```

最终结果：6 passed，exit 0。

| 项目 | 1440×1000 | 390×844 |
| --- | --- | --- |
| 门户顶栏入口、浮动入口、抽屉 | 通过 | 通过 |
| 抽屉 220ms 进入、160ms 退出、消息 180ms 进入 | 通过 | 通过 |
| closing 阶段保留 DOM、`aria-hidden`、`inert`，结束后卸载 | 通过 | 通过 |
| 抽屉焦点、Escape、精确焦点返回、完整工作区链接 | 通过 | 通过 |
| `/assistant` composer 聚焦、无重复浮动 M | 通过 | 通过 |
| `/admin/assistant` 登录保护、管理员上下文、后台导航 | 通过 | 通过 |
| `/login`、`/register`、`/staff/login`、`/staff/two-factor` | 通过 | 通过 |
| `/staff/change-password`、`/staff/re-auth`、已设置 TOTP 页面 | 通过 | 通过 |
| `scrollWidth === innerWidth` | 通过 | 通过 |
| 控制台 error / pageerror | 0 / 0 | 0 / 0 |
| 本地 image、font、script、stylesheet 失败 | 0 | 0 |

正常动态偏好下，抽屉只过渡 transform 与 opacity：进入 220ms、最大位移 12px，退出 160ms；新消息以 180ms opacity 与 6px 位移进入。快速重开会取消旧退出定时器，组件卸载会清理 timer 与 animation frame。reduced-motion 下莫比乌斯动画为静态，抽屉 transition、transform 与消息 animation 均被移除，关闭后立即卸载。纯键盘检查覆盖顶栏入口、浮动入口、抽屉输入、完整工作区链接、完整页 composer、后台导航和认证表单；所有目标均显示非零 focus outline。

Playwright 报告与桌面/移动截图保存在被忽略的 `artifacts/playwright/`。人工对照 `agent-experience-brand-spec.md` 检查门户抽屉、独立助理、深靛后台和认证壳层，未发现新的阻塞性视觉偏差。

凭据只存在于被忽略、权限为 0600 的 `.env.e2e`，本文不记录任何明文凭据。每类密码、密钥和 session token 均独立随机生成；Better Auth URL 和 origins 只指向 `http://127.0.0.1:8080` 代理。

## 发现并修复的缺陷

- 抽屉缺少进入完整 AI 助理工作区的键盘可达入口。先增加回归断言并得到真实 RED，再增加 44px 的 `/assistant` 客户端链接；导航时关闭抽屉并保留共享会话控制器。
- migrator 镜像以 `node` 用户启动时，pnpm 需要在 `/app` 创建临时文件，真实容器得到 `EACCES`。修复为只把 `/app` 和数据库包目录交给 `node`，没有使用 root runtime 或宽泛的 777。
- pnpm 11 在运行脚本前发现依赖状态差异会尝试运行时重装，非 TTY 容器因此主动中止。仅在 migrator stage 设置 `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`，使不可变镜像直接执行已安装的迁移工具；没有全局关闭其他校验。
- Docker build 曾显示读取 `apps/web/.env.local`。根因是 `.dockerignore` 只排除了根目录 env 文件；已增加 `**/.env`、`**/.env.*` 和 example 例外。修复后的构建不再加载本地 env。
- desktop/mobile 最初并发复用同一个 TOTP fixture，造成一次性验证码竞争。改为两个项目使用独立的管理员 fixture，不降低并发度，也不修改应用认证逻辑。
- 旧 reduced-motion E2E 将全部测试强制设为 reduce，只能证明“没有动画”，无法证明正常模式真的实现了动画。改为默认 no-preference，明确检查抽屉 220ms、消息 180ms 和 closing 160ms 生命周期，再在同一真实浏览器流程中独立切换 reduce 检查静态状态。
- 抽屉原本在关闭时立即卸载，缺少退出态，也无法安全处理快速重开。增加 `entering → open → closing → unmounted` presence 生命周期；closing 立即不可交互并回焦精确触发器，160ms 后才卸载，快速重开与组件卸载都会取消旧任务。
- reduced-motion 的初版规则选择器权重低于 `[data-motion-state="open"]`，真实 Chromium 仍计算出 identity transform。增加 CSS 契约 RED 后提高 reduced 选择器权重，最终桌面和移动均得到 `transform: none` 与零 transition。

上述 Docker 边界均增加静态 deployment contract 回归。首次拉取官方固定 Node 基础镜像和安装项目锁定的 Playwright Chromium 时遇到网络中断；缓存官方镜像 digest `sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd`、完成 Chromium 安装后，仍从完整脚本重新开始验收。

## 隔离与清理

E2E 项目固定为 `aap-assistant-e2e`。运行脚本在 EXIT、INT、TERM 时执行 `docker compose down -v --remove-orphans`，不复用普通 `.env`、常规 Compose 项目或数据卷。

失败和成功路径后均检查：项目标签下容器为 0，项目标签下数据卷为 0。用户已有的 `apps/web/next-env.d.ts` 本地差异保持为 `./.next/dev/types/routes.d.ts`，未加入提交。
