# 无会话、页面感知 AI 助理验收报告

日期：2026-08-12
基线提交：`ee8adcd`（Task 16）
Task 17 提交：待创建

## 结论

当前状态：**部分通过**。PostgreSQL、fresh Assistant runtime、Skill runtime 与除 page-hidden Orb 外的浏览器 Experience 门禁均通过。page-hidden Orb 的真实浏览器验收因当前自动化 Chromium 无法产生 `document.visibilityState=hidden` 而 **BLOCKED**。实际依赖边界测试已验证 cancel/resume，但不能替代真实浏览器 PASS。项目条件分支产生的 skip 单独记录，不作为适用场景的 PASS。

## 验收矩阵

| 范围                     | 命令                                                                            | 状态    | 证据                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 确定性 Agent 夹具        | `uv --directory apps/agent run pytest tests/test_e2e_deterministic_model.py -q` | PASS    | `25 passed`                                                                                                                |
| 格式                     | `pnpm format:check`                                                             | PASS    | workspace 全部 Prettier 检查通过                                                                                           |
| 类型 / lint              | `pnpm typecheck`、`pnpm lint`、Agent mypy/Ruff                                  | PASS    | TypeScript、mypy、ESLint、Ruff 均退出 0                                                                                    |
| Web 单测                 | `pnpm --filter @ai-agent-platform/web test`                                     | PASS    | 183 files passed，2384 tests passed；既有条件套件另有 9 files / 61 tests skipped，不计作 integration PASS                  |
| Agent 单测               | `pnpm agent:test`                                                               | PASS    | `1092 passed, 8 skipped`；skip 不计作外部门禁 PASS                                                                         |
| PostgreSQL integration   | Task 17 计划 Step 2 两条数据库命令                                              | PASS    | migration `1/1`；Web PostgreSQL `10/10`                                                                                    |
| Assistant runtime Docker | `RUN_ASSISTANT_RUNTIME_E2E=true sh docs/testing/run-assistant-runtime-e2e.sh`   | PASS    | 增强数据库 dump 扫描后的 fresh runner `19/19`；persistence scanner 与零残留清理均通过                                      |
| Skill runtime Docker     | `RUN_SKILL_RUNTIME_E2E=true sh docs/testing/run-skill-runtime-e2e.sh`           | PASS    | AgentOS session 行数 `0 → 0`；runner 退出 `0`                                                                              |
| Experience Docker        | `sh docs/testing/run-assistant-experience-e2e.sh`                               | PARTIAL | 其余适用场景 `21 passed`，另有 `5` 条项目条件 skip；page-hidden 真实浏览器验收 BLOCKED；fresh manifest 为 `status: passed` |

## 必须记录的运行时证据

- `agno.agno_sessions`：浏览器 AgentOS 阶段前后计数相等。
- `assistant_input_policy`：恰好 1 行，由 Admin 即时阻断场景创建。
- `rate_limits`：`assistant:%` 行数大于 0。
- 排除 `assistant_input_policy` 数据后的数据库 dump 与 Compose 全日志：问题、答案、私有 CoT、即时阻断词、产品页正文 marker，以及带安全边界的裸 `run_id` / `session_id` 字段名均为 0 命中。
- HTTP：即时阻断返回精确 `422 input_blocked`，Agent 日志不增长；Provider 未调用由 BFF 集成测试证明。

runtime Docker 首次构建被 pnpm 的 release-age policy 拒绝，因为用户指定的 `thinking-orbs@0.3.1` 尚未超过最短发布时间窗口。修复仅为 `pnpm-workspace.yaml` 中 exact `minimumReleaseAgeExclude` 条目；未使用 wildcard，也未关闭全局策略。对应 deployment contract 静态回归已通过；该构建失败不算 runtime PASS，必须重跑完整 runner。

数据库 dump 改用 `--data-only --inserts`，避免把 COPY 元数据列名误判为持久化数据，同时保留对实际值中私有 CoT、即时阻断词与裸身份字段的检测。增强后的 fresh runtime runner 以 `19/19` 退出 `0`，persistence scanner 与最终零残留清理均通过。

## 浏览器证据

Docker Experience runner 以隔离输出目录生成并校验 8 张 Playwright attachment；`.last-run.json` 为 `passed`，exact manifest 位于本地 `artifacts/playwright/assistant-experience/aap-assistant-e2e-final-c01a20eb9f1a19d4dc6a3b9021f91dd6/attachments-manifest.json`，作为验收产物保留，不纳入 Git 提交：

- `desktop-admin-assistant` → `15259e8ce973da15b5af601bae57028e8c87ef4d.png`
- `desktop-assistant-workspace` → `91a82c6fc9a4d4bfeb05c6c1193690b248cc91ff.png`
- `desktop-auth-shell` → `c537217c163c8a1ab2424d5ff80235f92cfb9cd7.png`
- `desktop-portal-drawer` → `ab9f5573fff4c899ebd8bf756188c1b81cd02c3d.png`
- `mobile-admin-assistant` → `08eaa4e6ad97c94c85251912d729b31e5f5fe4f4.png`
- `mobile-assistant-workspace` → `5e167ed052a01d52117601dfc3af02b996d2e7b0.png`
- `mobile-auth-shell` → `b032dd131aa55a33ecad57166426c9e15ea843c8.png`
- `mobile-portal-drawer` → `bb5026f003391197916f981f702f31238a186221.png`
- no conversation rail、单行 chips、首条后隐藏
- activity 工作态与默认收起审计轨迹
- Markdown 链接纯文本与安全 action 点击
- 390px 无溢出；reduced-motion 下 `breathing`、`searching`、`solving`、`working` 四种 Orb 映射状态的原生绘制计数保持静止
- desktop 真实浏览器证明 Orb 离开视口后停止绘制、返回视口后恢复；页面隐藏分支由实际 `thinking-orbs` 依赖边界测试证明 cancel/resume。当前自动化 Chromium 无法产生真实 `document.visibilityState=hidden`，因此未将人工 visibility event 声称为浏览器 PASS

## 数据边界

本报告只验证平台控制的数据库、日志、Cookie 和运行时会话行为。第三方模型供应商可能按其服务条款或账户设置保留请求；这部分不受本平台代码控制，不能由本验收声明为“零保留”。
