# AgentOS AI 助理与企业工作台 UI 设计规格

> 日期：2026-07-13
> 状态：已确认
> 视觉方向：D · 企业智能工作台
> 设计依据：`docs/design/agent-experience-ui-exploration.html`
> 品牌依据：`docs/design/agent-experience-brand-spec.md`
> Agno 事实记录：`docs/design/product-facts.md`

## 1. 背景

当前项目已经具备：

- 公共门户、客户控制台和员工后台三类工作区；
- 客户、员工、管理员身份与权限边界；
- 安全占位聊天接口和右下角 M 助理入口；
- PostgreSQL、Docker、Nginx 与企业部署基础；
- 蓝、青、靛、紫品牌令牌和本地品牌素材。

本次工作要把占位聊天能力升级为可持续扩展的企业 AI 助理入口，同时建立 Agno AgentOS 服务边界，并统一 Admin、Auth 和聊天页面的 UI 系统。

## 2. 目标

1. 在公共门户顶部导航新增莫比乌斯环 AI 助理入口。
2. 保留右下角 M 入口，两者打开同一个快速咨询侧栏。
3. 新增公开独立聊天页 `/assistant`。
4. 新增管理员页面 `/admin/assistant`，提供服务状态、配置占位、测试台和脱敏会话占位。
5. 新增可 Docker 启动的 Python Agno AgentOS 服务 `apps/agent`。
6. 复用现有 PostgreSQL 实例，通过独立 Agno schema 隔离会话数据。
7. 重做 Admin 全局框架和完整 Auth 链路的 UI。
8. 保留当前安全占位回答，未配置模型时绝不伪造真实 AI 能力。

## 3. 非目标

本阶段不包含：

- 真实模型 API Key 或模型调用；
- 真实 Skill 加载与执行；
- 知识库、Memory、Team 或 Workflow 的业务配置；
- 完整聊天内容审计与人工接管；
- 计费、Token 统计或成本报表；
- 文件、图片、语音等多模态输入；
- 生产域名、TLS 证书和外部模型网络策略；
- 正式可授权 Logo SVG、反白版或完整 Figma 设计系统。

## 4. 总体架构

采用独立 AgentOS 服务与 Next.js BFF：

```text
Portal Header / M Launcher / /assistant / /admin/assistant
                           │
                           ▼
                  Next.js Assistant BFF
       身份映射 · 权限 · 限流 · 校验 · 超时 · requestId
                           │
                           ▼
                  AssistantProvider Interface
                  ├── PlaceholderProvider
                  └── AgnoAgentOSProvider
                           │
                           ▼
                    Python Agno AgentOS
         Agents · Sessions · Skills placeholder · Health
                           │
                           ▼
              PostgreSQL instance / isolated agno schema
```

### 4.1 为什么必须经过 BFF

- 浏览器不直接接触 AgentOS 地址或 `OS_SECURITY_KEY`；
- 公共匿名会话与平台用户身份在 Next.js 边界统一映射；
- 沿用现有 Nginx 限流和请求大小限制；
- 对外协议保持稳定，未来可替换模型或 AgentOS 内部结构；
- 管理员权限和审计仍由平台身份系统控制。

### 4.2 AssistantProvider

现有占位实现继续作为默认 Provider。Provider 由显式服务端配置选择，不在每次聊天请求中临时探测后切换。新增 AgentOS Provider，但只有在以下条件全部满足时才进入 `ready` 能力状态：

- AgentOS 健康检查通过；
- 服务端安全密钥存在；
- 默认 Agent 已配置；
- 模型提供方已配置；
- 运行开关已明确开启。

任一条件缺失时，系统返回明确的占位或降级状态，不尝试隐式调用。

AgentOS 状态拆为三个维度：

- `live`：进程能够响应，不代表数据库或模型可用；
- `ready`：服务配置和数据库依赖可用；
- `capability`：`placeholder / available / degraded`，描述真实对话能力。

BFF 使用短 TTL 缓存就绪状态，不对每次聊天同步执行完整健康探测。连续失败进入短时熔断，熔断期直接返回安全降级；探测成功后自动恢复。具体 TTL、超时和失败阈值写入配置并在 Admin 状态页展示。

## 5. 仓库结构

```text
apps/
├── web/
│   └── src/
│       ├── app/assistant/
│       ├── app/admin/assistant/
│       ├── app/api/v1/assistant/
│       ├── components/assistant/
│       ├── components/admin/
│       ├── components/auth/
│       └── server/assistant/
└── agent/
    ├── src/
    │   ├── app.py
    │   ├── config.py
    │   ├── agents/
    │   ├── skills/
    │   └── storage/
    ├── tests/
    ├── pyproject.toml
    └── Dockerfile

packages/
└── ui/
    └── src/
        ├── navigation/
        ├── admin-shell/
        ├── auth-shell/
        └── tokens.css
```

具体文件可按现有深模块约束调整，但边界必须保持：UI 组件不能直接调用 AgentOS，AgentOS 不能绕过平台身份系统对外公开。

## 6. 路由与权限

### 6.1 公共路由

| 路由 | 状态 | 访问范围 | 说明 |
| --- | --- | --- | --- |
| `/assistant` | live | 公开 | 独立聊天工作台 |
| `/api/v1/assistant/chat` | live | 公开、限流 | 统一聊天 BFF |
| `/api/v1/assistant/status` | live | 公开、只返回安全状态 | `live / ready / capability` |

匿名用户使用临时会话标识。未来登录客户可把会话与平台用户 ID 关联，但本阶段不承诺跨设备历史。

### 6.2 管理路由

| 路由 | 权限 | 说明 |
| --- | --- | --- |
| `/admin/assistant` | `admin:assistant` | AI 助理管理与测试 |
| `/api/v1/admin/assistant/status` | `admin:assistant` | AgentOS、数据库、模型与开关状态 |
| `/api/v1/admin/assistant/chat` | `admin:assistant` | 管理员专用测试代理，不复用公开聊天授权边界 |
| `/api/v1/admin/assistant/sessions` | `admin:assistant` | 脱敏会话元数据 |

新增权限 `admin:assistant`，不得复用 `admin:analytics`、`admin:site` 或其他宽权限。默认管理员角色的权限迁移必须显式、可审计。

## 7. AgentOS 服务

### 7.1 服务职责

- 启动 AgentOS / FastAPI 应用；
- 暴露内部健康检查与 API 文档；
- 建立 PostgreSQL 会话存储连接；
- 提供 Agent、Skill 和模型配置目录；
- 接受来自 Next.js BFF 的受保护调用；
- 为后续 Agent、Team、Workflow、Session 和 Skill 留出标准扩展点。

### 7.2 未配置模型时

- AgentOS 服务可以启动并报告基础设施健康；
- Agent 注册表为空或处于不可运行配置；
- Next.js 继续使用 PlaceholderProvider；
- Admin 显示“服务已就绪 / 模型未配置 / 占位模式”；
- 公共页面不能展示“AI 已生成”等误导文案。

### 7.3 PostgreSQL

- 复用当前 PostgreSQL 容器和备份体系；
- Agno 数据固定使用独立 `agno` schema；
- 新增 `ai_agent_agno_migrator` 与 `ai_agent_agno` 两个角色：前者只负责 `agno` schema 的 DDL，后者只拥有该 schema 的运行期 DML；
- 两个 Agno 角色均撤销对 `public` 业务 schema 的 `USAGE` 和对象权限，平台 runtime 角色也不获得 `agno` schema 权限；
- `ai_agent_backup` 只获得 `agno` schema 的只读权限，备份与恢复演练必须覆盖该 schema；
- 账号、组织、角色等核心业务表仍归 `packages/database` 管理；
- Agno 运行表不得成为平台身份事实来源；
- schema 初始化和升级由独立一次性迁移步骤执行，不允许 AgentOS runtime 在启动时静默执行 DDL；
- 初始化脚本必须幂等；已有 Docker volume 通过显式 upgrade 命令执行，不能只依赖 `/docker-entrypoint-initdb.d`；
- 升级失败必须阻止 AgentOS 进入 `ready`，并提供恢复验证步骤。

### 7.4 Docker

新增 `agent` 服务并纳入 Compose：

- Web 只通过内部 Docker 网络访问 AgentOS；
- AgentOS 只通过内部网络访问 PostgreSQL；
- 对外只暴露 Nginx；
- 本地开发可选择暴露 AgentOS 文档端口；
- 健康检查必须区分进程存活与依赖就绪；
- 真实安全密钥只进入本地 `.env`、部署 Secret 或服务器环境，不提交 Git。
- AgentOS 采用非 root 用户、只读根文件系统、受限 `tmpfs`、`no-new-privileges`、`cap_drop: ALL` 和明确资源限制；
- Python 依赖使用锁文件和固定基础镜像，运行端口仅 `expose` 到 backend 网络，不向宿主机发布；
- 本地 API 文档端口只能通过显式 development override 开启。

### 7.5 匿名会话与保留

- 匿名标识只由 BFF 签发，不接受客户端提交的平台用户 ID；生产 HTTPS 使用 `__Host-aap_assistant_sid`，本地 HTTP 使用无前缀的 `aap_assistant_sid_dev`；
- 两类 Cookie 都使用不可预测随机值，并设置 `HttpOnly`、`SameSite=Lax`、`Path=/`；`__Host-` 版本始终设置 `Secure`，开发版只允许在明确的 development 环境使用；
- 匿名会话默认 30 分钟空闲过期、24 小时绝对过期；无效或过期时轮换，登录态绑定变化时重新签发；
- 占位模式不在服务端持久化消息；页面刷新后的历史仅是前端临时展示，不承诺恢复；
- AgentOS 真正启用后，匿名会话及消息默认保留 30 天，定时清理；部署方可缩短但不能无上限延长；
- 管理员列表只显示：脱敏会话 ID、模式、状态、创建时间、最后活动时间和消息数量；不显示原文、原始 IP、完整 User-Agent 或 Cookie 值；
- “结束会话”立即失效 Cookie，并触发对应匿名会话删除任务。

## 8. UI 视觉系统

最终采用 D 混合方案“企业智能工作台”：

- Admin：B“控制平面”的深靛导航与高密度亮色工作区；
- Assistant：C“空间智能”的大字号、宽内容轨和轻计算网格；
- Auth：A“精密栅格”的克制表单结构，加深靛品牌说明区；
- Header：莫比乌斯环承担 AI 状态入口；
- 所有页面共用现有品牌色、字体、8px 间距节奏与统一动效曲线。

### 8.1 颜色

- Primary：`#3A67B1`
- Signal：`#56C0F8`
- Structural：`#4C91EB`
- AI Accent：`#9277DC`
- Ink：`#101838`
- Canvas：`#F7F8FB`
- Surface：`#FFFFFF`
- Line：`#DCE3EF`

紫色只用于 AI/Agent 状态和莫比乌斯信号；蓝色承担主操作；青色用于窄范围状态提示。禁止大面积蓝紫装饰渐变。

### 8.2 动效

- 莫比乌斯环：6 秒线性旋转，只动画 `transform`；
- 按钮按下：`scale(0.97)`，160ms；
- 侧栏进入：220ms 强 `ease-out`；
- 侧栏退出：更短，避免拖沓；
- 消息出现：透明度加最多 6px 位移，不弹跳；
- 键盘触发不增加等待动画；
- `prefers-reduced-motion` 下停止莫比乌斯旋转和位移动画。

### 8.3 可访问性

- 所有入口至少 44×44px；
- 移动端隐藏按钮文字时保留固定 `aria-label`；
- 侧栏关闭状态使用 `inert + aria-hidden`；
- 打开后焦点进入关闭按钮；Esc 关闭后焦点返回触发入口；
- 焦点样式必须清晰，不依赖颜色变化；
- 后台、登录、改密与 2FA 不显示公共聊天入口。

## 9. 顶部 AI 助理入口

### 9.1 位置

公共门户顶部导航右侧，位于“登录 / 进入平台”按钮之前。

### 9.2 表现

- 桌面端：“莫比乌斯环 + AI 助理”；
- 移动端：只显示图标，但保留可访问名称；
- 点击打开现有快速咨询侧栏；
- 右下角 M 入口继续存在；
- `/assistant` 页面不再显示重复的 M 悬浮入口；
- `/assistant` 页面顶部入口表示当前 AI 工作区，点击后聚焦主输入框，不再打开侧栏；
- 侧栏提供“进入完整聊天界面”链接。

## 10. 独立聊天页 `/assistant`

### 10.1 桌面布局

- 左侧：新建会话与会话历史占位；
- 中间：Agent 身份、服务状态、欢迎内容、建议问题、消息流和输入框；
- 输入区固定在可视工作区底部；
- 未来 Skill 与工具调用使用独立步骤槽位，不混入普通消息文本。

### 10.2 移动端

- 会话列表折叠，不占主内容宽度；
- 顶部保留 Agent 身份和安全状态；
- 输入区不被悬浮元素遮挡；
- 页面不得产生横向滚动。

### 10.3 状态

- `placeholder`：模型未配置，展示明确能力边界；
- `available`：未来真实 Agent 可运行；
- `degraded`：AgentOS 不可用或超时，允许安全重试；
- `rate_limited`：提示稍后再试，不泄露限流实现；
- `validation_error`：输入错误靠近输入区显示。

前三项是 `capability` 枚举；后两项是单次请求错误，不进入 capability。聊天响应的 `mode` 仅允许 `placeholder / agentos`，不得复用 `ready`。

## 11. Admin UI

### 11.1 全局框架

- 深靛左侧导航，明确分组、当前页面和权限过滤；
- 顶部上下文区提供面包屑、环境状态和管理员身份；
- 页面使用统一标题、状态条、表格、表单、空状态和错误状态；
- 不逐页重写业务逻辑，现有页面通过共享组件继承新视觉。

### 11.2 `/admin/assistant`

包含：

1. AgentOS、数据库、模型、公开入口四类状态；
2. 默认 Agent、模型、Skill、会话存储配置占位；
3. 管理员测试对话区；
4. 最近会话脱敏元数据占位；
5. 清晰标注“只读 / 未配置 / 待接入”。

本阶段不提供修改真实模型密钥的表单，不展示客户完整聊天内容。

## 12. Auth UI

覆盖：

- `/login`；
- `/staff/login`；
- `/staff/change-password`；
- `/staff/re-auth`；
- `/staff/two-factor`；
- 注册及邮箱验证相关页面应复用同一 Auth Shell。

本阶段只改造仓库中已经存在的注册页面；邮箱验证尚无独立业务路由，只作为未来页面必须复用 Auth Shell 的约束，不虚构可访问页面。

桌面端使用“品牌说明区 + 操作区”，移动端合并为单列。Auth Shell 不显示公共门户导航、页脚或聊天入口。客户与员工通过文案和上下文标签区分，不创建两套互不兼容的组件。

## 13. 数据流与故障处理

### 13.1 聊天请求

1. UI 发起一次明确提交；BFF 生成或接受格式合法的 correlation request ID；
2. BFF 校验内容、长度、路径和会话来源；
3. BFF 从服务端会话和签名 Cookie 映射匿名或登录用户标识，不信任请求体用户 ID；
4. BFF 选择 Placeholder 或 AgentOS Provider；
5. AgentOS 调用仅使用服务端密钥；
6. BFF 把响应转换成稳定平台协议；
7. UI 用 request ID 关联日志与一次提交的结果，不把它当作服务端幂等键。

### 13.2 平台 API 协议

公共聊天请求：

```json
{
  "message": "如何准备私有化部署？",
  "context": { "pathname": "/assistant" }
}
```

成功响应统一为：

```json
{
  "version": "1",
  "requestId": "uuid",
  "mode": "placeholder",
  "session": { "temporary": true, "expiresAt": "2026-07-13T12:00:00Z" },
  "message": { "id": "opaque", "role": "assistant", "content": "..." },
  "suggestedActions": []
}
```

状态接口只返回 `version`、`requestId`、`live`、`ready`、`capability` 和安全展示文案。管理状态接口可增加组件级状态，但仍不得返回连接串或密钥。

Cookie 中的匿名会话凭据及其任何可重放等价值不得出现在 JSON 响应、日志或管理页面。客户端只获得 `temporary` 与过期时间；若 UI 需要展示编号，应由服务端生成与凭据无关的短别名。

错误统一为：

```json
{
  "version": "1",
  "requestId": "uuid",
  "error": { "code": "rate_limited", "message": "请稍后重试", "retryable": true }
}
```

- `400`：`validation_error`；
- `401/403`：仅管理 API 的认证或权限错误；
- `429`：`rate_limited`；
- `503`：`assistant_unavailable`；
- request ID 仅用于关联一次请求和日志，不提供跨请求去重；
- 聊天 POST 不自动重试，用户手动重试会创建新的 request ID；因此本阶段不引入幂等存储。

### 13.3 超时与重试

- AgentOS 调用必须有明确超时；
- 聊天 POST 不能无条件自动重试；
- 用户手动重试明确创建新 request ID；
- 失败消息保留在会话中并允许安全重试；
- 服务端错误日志不记录原始密钥和完整敏感消息。

### 13.4 限流边界

- Nginx 负责第一层 IP 限流；生产 Compose 保证 Web 不发布宿主端口，只能经 Nginx 访问；
- BFF 仍实施第二层应用限流，不能把安全性只建立在反向代理存在上；
- 匿名请求按哈希后的服务端会话 ID 加可信客户端 IP 限流，登录用户按平台 actor ID 限流，管理员测试台按管理员 actor ID 使用独立额度；
- 多实例 BFF 的限流计数存储必须共享，首选 PostgreSQL；不得使用各实例互不一致的纯内存计数作为生产实现；
- 只有 `TRUST_NGINX_PROXY=true` 且来源属于内部代理边界时才解析转发 IP；其他情况使用直接连接地址；
- 限流响应只返回统一 `429` 错误体，不泄露阈值与内部键。

## 14. 安全要求

- AgentOS 仅接受内部网络和 Bearer Security Key 调用；
- 公开状态接口不返回 AgentOS URL、数据库地址、模型密钥或异常栈；
- 管理接口必须同时校验员工会话和 `admin:assistant`；
- 匿名会话限流沿用并扩展现有 Nginx 策略；
- BFF 应用层限流作为 Nginx 之外的强制第二层；
- 请求体大小和 Unicode 码点长度必须一致；
- 会话列表默认只返回脱敏元数据；
- 所有密钥和本地 `.env` 保持 Git 忽略；
- 新容器依赖使用锁定版本和可复现构建。

## 15. 测试与验收

### 15.1 AgentOS

- 配置解析；
- 健康检查；
- PostgreSQL 连接与 schema 隔离；
- `ai_agent_agno` 无法访问 `public`，平台 runtime 无法访问 `agno`；
- 已有 volume 的 schema upgrade 可重复执行；
- backup/restore 包含 `agno` schema 且恢复后可读取；
- 缺少密钥或模型时安全启动/明确失败；
- 内部安全密钥校验。

### 15.2 Next.js

- Provider 选择与降级；
- 公共和管理员权限；
- `/api/v1/admin/assistant/chat` 在未登录、缺权限和有权限三种状态下分别验收；
- 限流、超时、请求体大小、Unicode 长度；
- 绕过 Nginx 直测 BFF 限流，多实例使用同一共享计数；
- 匿名 Cookie 的名称、`HttpOnly`、`SameSite`、`Secure`、过期和轮换；
- JSON、日志和管理员元数据均不出现 Cookie 凭据或其可重放等价值；
- request ID 关联且不误作幂等键；
- 安全状态转换；
- Route registry、导航和文件结构覆盖。

### 15.3 UI

- 顶部莫比乌斯入口和右下角 M 共用会话控制器；
- 侧栏打开、关闭、Esc、焦点回归；
- `/assistant` 桌面与移动端；
- `/admin/assistant` 权限和状态；
- 客户登录、员工登录、改密、重认证、2FA；
- reduced-motion；
- 无横向滚动和最小 44px 目标。

### 15.4 项目门禁

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- Playwright 桌面与移动端关键路径
- Docker Compose 配置解析与健康检查
- AgentOS 容器以非 root、只读根文件系统和 `cap_drop: ALL` 运行，且宿主机无 AgentOS 发布端口
- AgentOS Python 单元测试和静态检查

## 16. 实施顺序

1. 冻结设计令牌和共享 Shell 组件边界；
2. 新增路由、导航与 `admin:assistant` 权限；
3. 实现顶部莫比乌斯入口和共享侧栏控制器；
4. 实现 `/assistant`；
5. 实现 Admin Shell 和 `/admin/assistant`；
6. 实现完整 Auth Shell；
7. 建立 `apps/agent`、PostgreSQL 隔离和 Docker 服务；
8. 建立 AgentOS Provider 与安全降级；
9. 完成端到端、Docker 与视觉验收；
10. 更新架构、开发、部署与操作手册。

## 17. Shell 与共享控制器边界

- `SiteShell` 使用显式路由分类：`portal / assistant / auth / console / admin`；不能再把全部非工作区页面默认为 portal；
- `auth` 与 `admin` 路由不创建 Assistant session，也不挂载公共 Assistant Provider；
- `portal` 和 `assistant` 由 Web 层 `AssistantExperienceProvider` 管理会话、侧栏、触发入口和焦点；`packages/ui` 只接收入口 slot/回调，不直接调用 BFF；
- 顶部莫比乌斯与浮动 M 共用同一 Provider。Provider 保存本次打开侧栏的触发元素，Esc 或关闭后只把焦点返回该元素；
- `/assistant` 使用同一协议与会话来源，但不渲染浮动 M；顶部入口点击后聚焦主输入框；
- `console` 是否提供客户专属助理属于后续范围，本阶段不挂载公共匿名聊天。

## 18. 完成标准

- 公共门户页面上的顶部莫比乌斯入口和 M 入口均可打开同一快速咨询侧栏；`/assistant` 顶部入口只聚焦主输入框；
- `/assistant`、`/admin/assistant` 和完整 Auth 链路符合 D 方案；
- Admin/Auth 不显示公共聊天入口；
- AgentOS 可在 Docker 内启动并连接独立 Agno 数据边界；
- 未配置模型时继续安全占位，不出现虚假 AI 响应；
- `admin:assistant` 权限独立生效；
- 所有项目门禁、真实浏览器和容器检查通过；
- 无真实密钥或本地环境文件进入 Git。
