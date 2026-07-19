# 2026-07-19 日报：码多多单 Agent 闭环

## 基本信息

- 工作目录：`/Users/brou/Documents/Work/00-ahkzy/AI Agent Platform/.worktrees/maduoduo-single-agent-loop`
- 功能分支：`codex/feat-maduoduo-single-agent-loop`
- 合并目标：本地 `main`
- 本分支累计：108 个提交，覆盖码多多运行时、动态模型控制面、后台配置界面和验收边界。

## 本轮完成

1. 打通“码多多”单 Agent 基础闭环：Web BFF 调用固定 `maduoduo` Agent，支持临时测试会话和正式会话。
2. 接入 OpenAI、Claude、Gemini、Qwen / DashScope、DeepSeek、MiniMax 六类云模型适配器。
3. 建立动态模型运行槽：后台测试成功后原子切换活动模型，测试失败不替换旧模型；Agent 重启后从数据库恢复活动配置。
4. 建立模型配置控制面：草稿修订、Endpoint 白名单、真实模型验证、测试并启用、运行版本展示和活动指针管理。
5. 模型 Key 使用 AES-256-GCM 加密后写入独立控制数据库边界；Web 不接触加密主密钥，后台查看 Key 经过独立权限、近期 MFA 和审计事件。
6. 在现有 `/admin/assistant` 中完成云模型配置界面，支持保存草稿、测试并启用、查看已保存 Key、配置状态和运行状态。
7. 保留模型 registry、Endpoint catalog、Skill / 知识库 / 工具路线图和未来本地模型仓库扩展边界；本地算力 Provider 尚未正式实现。
8. 完成一次 DeepSeek 真实链路验收：草稿保存成功，rev 1 测试通过并启用，Agent 内部对话返回 HTTP 200。

## 本次实际故障与修复

| 现象                                                                              | 根因                                                                                                                                         | 修复方式                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/assistant` 因 `AGENTOS_INTERNAL_URL must be an exact HTTP(S) origin` 崩溃 | 本地值不是无路径、无尾斜杠的精确 HTTP(S) origin；页面加载又直接依赖控制客户端初始化                                                          | 本地改为 `http://127.0.0.1:7777`；控制面不可用时页面安全降级，不再让整个管理页面崩溃                                             |
| 配置输入框只读、显示“控制面暂不可用”                                              | 旧启动契约把 `AGENT_ENABLED=true` 与预置 Provider / Model / Key 强绑定，导致没有 bootstrap 模型时 Agent 无法只启动动态控制面                 | 拆分可选 bootstrap 模型与动态控制面；允许无预置模型启动，补齐 control role、迁移、加密 Key 和内部控制 Key                        |
| 保存草稿提示“配置内容无效”                                                        | 浏览器使用 `http://localhost:3000`，但 `BETTER_AUTH_TRUSTED_ORIGINS` 只允许 `http://127.0.0.1:3000`；安全拒绝被统一映射为 `validation_error` | 本地同时信任 `127.0.0.1` 与 `localhost`；用相同无登录请求验证状态从 400 进入正常鉴权分支 401                                     |
| 模型已测试启用，但测试控制台仍提示“暂时失败”                                      | Web 本地环境缺少四个 readiness 参数；运行时初始化直接失败并降级，而模型控制面使用独立客户端，所以控制面仍可成功                              | 补齐 readiness TTL、探测超时、失败阈值、熔断恢复时间和运行超时；重启 Next 后 Web 状态恢复为 `live=true / ready=true / available` |
| 修改环境变量后状态没有立即恢复                                                    | `getAssistantRuntime()` 把环境解析结果保存在全局单例中，热更新没有替换旧实例                                                                 | 完整重启 Next 开发进程后重新探测                                                                                                 |
| 一次诊断脚本没有输出结果                                                          | 使用了 zsh 只读变量名 `status`                                                                                                               | 改用 `http_code`，清理同名临时会话后重新执行；该次失误与产品代码无关                                                             |

## 为什么需要多轮调试

1. 这不是一个单点功能，而是 Browser → Next BFF → AgentOS → Agno Agent → 模型 Provider → PostgreSQL 的多层闭环；每层都有独立的认证、配置和健康状态。
2. 系统按安全优先设计为 fail closed。缺少一个 origin、内部 Key、数据库角色或 readiness 参数时会拒绝或降级，不会自动猜测配置。
3. 前端有意隐藏内部错误和敏感信息，多个后端原因会显示成同一句“配置内容无效”或“暂时失败”，必须结合 HTTP 状态、Agent health 和 BFF 状态逐层排除。
4. “测试并启用”与“实际聊天”共用模型适配器，但不共用完整调用链。前者成功只能证明 Key、Endpoint 和模型调用正常，后者还依赖 Web readiness、会话和 AgentOS 运行传输。
5. 单元测试使用完整的显式环境 fixture，Compose 又为 readiness 提供默认值；本机 `apps/web/.env.*` 没有同步新增项，因此测试通过但本地开发环境仍会失败。
6. 本地浏览器、Docker、Next 和执行沙箱处于不同边界；浏览器控制桥不可用、沙箱默认不能访问本机端口或绑定 3000，增加了诊断步骤，但这些不是线上产品故障。

## 后续改进建议

1. 增加开发环境 preflight，一次性列出缺失的非敏感变量、错误 origin 和不可达服务。
2. 管理页面保留安全错误文案，但在服务端结构化日志中记录失败阶段和 request ID，减少盲查。
3. 增加从本地 `.env.example` 启动 Next、连接 Agent 并完成一次 BFF 测试的集成验收，覆盖“fixture 完整、本机环境缺项”的空档。
4. 后续再实施模型 ID 下拉和在线模型目录同步；本轮没有把未验证的模型列表写死到界面。
5. 本地模型仓库只保留扩展边界，正式接入前必须单独定义 Provider、内网 Endpoint、鉴权、资源状态和模型能力发现协议。

## 验证

- 合并后的 JS/TS 套件：1877 passed，66 skipped；其中 Web 129 个测试文件分批完成，1641 passed、43 skipped。
- 合并后的已跟踪 Agent 套件：931 passed，5 skipped，1 个第三方弃用 warning。
- 精确合并提交在干净 detached worktree 中完成 Web typecheck 和 Next 生产 build，39 个静态页面生成成功。
- 合并前功能分支的 Web、database、integrations、UI typecheck、ESLint、Agent mypy 和 Ruff 全部通过。
- 功能工作树的 `docker compose config --quiet` 可解析；主工作树仍需迁移本地 `.env`，当前首先缺少 `ASSISTANT_PUBLIC_ORIGIN`，不能冒充主工作树 Compose 已验收。

## 未完成/未冒充完成

- Model ID 下拉菜单和主流模型在线目录尚未实施。
- 自有服务器本地算力入口尚未实现，只保留架构扩展点。
- 尚未在一台全新服务器上执行完整迁移演练；迁移所需配置见 `docs/deployment/maduoduo-environment-migration.md`。
