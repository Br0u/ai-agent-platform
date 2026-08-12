# 码多多无会话、页面感知与内容规则设计规格

> 日期：2026-08-12
> 状态：已确认
> 前置规格：`2026-07-16-maduoduo-single-agent-loop-design.md`、`2026-08-07-simple-skill-management-design.md`

## 1. 背景与纠正

当前公开助手通过签名匿名会话和 AgentOS 数据库保存多轮记录，完整助手页仍显示 `CONVERSATIONS` 侧栏，浮动窗口的三个常见问题按钮占用大量阅读空间。浏览器只传 pathname，Agent 无法读取当前页面正文；AgentOS 流解析只消费最终内容，未建立“活动摘要、最终回答、跳转动作”的结构化边界。

本规格直接替换旧的持久会话产品路径，不保留兼容层。

用户最初使用了“添加 CoT”的表述，但产品不应展示模型逐字内部推理。模型推理可能包含安全策略、提示词、无依据的中间判断或供应商私有字段。产品展示的是由可信运行事件生成的“活动摘要”，不是原始 Chain of Thought。最终回答与活动摘要必须分流。

“平台不存储”只约束本项目控制的浏览器持久化、Web、AgentOS、数据库、日志和缓存。请求仍会发送给当前配置的第三方模型供应商；供应商侧的处理与保留取决于企业合同和供应商配置，本项目不能把它宣称为零保留。

## 2. 目标

1. 删除公开助手的会话历史侧栏及所有会话管理入口。
2. 只在当前页面的浏览器内存中支持多轮对话；刷新、关闭或切换页面立即清空。
3. 用户问题、AI 回答、页面正文和聊天会话标识不写入平台持久化介质。
4. 将浮动窗口的常见问题改为单行横向滚动提示词片，并在首条消息后隐藏。
5. 用结构化活动摘要展示页面读取、分析和工具执行状态；永不下发原始推理。
6. 在 Admin 的 Agent 管理中提供可自行配置的用户输入屏蔽词。
7. 让助手读取当前公开页面的受限可见内容，并可建议公开站内页面跳转。
8. 跳转必须由用户点击确认，不能自动导航、填写或提交表单。
9. 使用 `thinking-orbs` 的画布状态作为统一助手身份，并以蓝、靛、紫渐变包装。

## 3. 非目标

- 不持久化或恢复聊天记录。
- 不提供多会话、新建会话、会话搜索、会话列表或后台会话查看。
- 不展示逐字模型推理、`reasoning_content`、隐藏提示词或未经筛选的工具参数。
- 不对 AI 输出执行通用敏感词截断；流式输出在命中后再截断会先泄漏部分内容。
- 不读取 Admin、Console、登录注册、表单页、隐藏 DOM、Cookie、LocalStorage 或浏览器扩展数据。
- 不自动导航，不点击按钮，不填写、提交或删除数据。
- 不允许模型提供任意 URL、外站 URL、`javascript:` URL 或未注册路由。
- 不引入规则分类、正则表达式、导入导出、规则历史浏览或组织级规则。
- 不实现知识库和远程网页抓取。

## 4. 已确认产品决策

| 主题 | 决策 |
| --- | --- |
| 会话 | 当前页面内存多轮；刷新、关闭或 pathname 改变即清空 |
| 侧栏 | 完整删除 `CONVERSATIONS` 栏及会话管理入口 |
| 提示问题 | 单行横向滚动词片，仅空会话显示 |
| 推理展示 | 活动摘要与最终回答分离；完成后默认折叠 |
| 原始 CoT | 永不展示、永不记录 |
| 内容规则 | 只拦截用户输入；Admin Agent 管理可配置 |
| 匹配 | 中文连续子串；英文忽略大小写；去空、去重；不支持正则 |
| 页面读取 | 每次提问携带当前公开页面的受限可见正文和站内链接 |
| 页面操作 | 只建议同站公开路由；用户点击按钮后跳转 |
| Orb | 统一用于入口、头像和工作状态；蓝靛紫渐变 |
| 持久化 | 只保留屏蔽词配置、配置审计元数据和无内容限流计数 |

## 5. 总体架构

```text
Browser page memory
  ├─ current-page transcript
  ├─ current pathname + search only
  └─ user question
        |
        v
Next.js assistant BFF
  ├─ validate request and public route
  ├─ anonymously refetch and extract the public page
  ├─ consume opaque rate-limit counter
  ├─ load and enforce input policy
  └─ build untrusted bounded prompt
        |
        v
AgentOS non-persisting Agent run
  ├─ current Skill generation
  ├─ navigation suggestion tool
  ├─ activity/tool events
  └─ final content events
        |
        v
Next.js structured stream
  ├─ activity summary
  ├─ final answer delta
  └─ validated navigation action
        |
        v
Browser rendering and user-confirmed navigation
```

浏览器继续只访问 Next.js BFF。AgentOS、模型密钥和内部 Bearer 仍不暴露给浏览器。

## 6. 浏览器会话与请求合同

### 6.1 页面内存会话

`useAssistantSession` 只在 React 内存中保留当前页面消息，不写 Cookie、SessionStorage、LocalStorage 或 IndexedDB。共享 Provider 监听 pathname：pathname 改变时清空消息、草稿、活动状态和建议动作；刷新、关闭标签页或进程退出由浏览器自然清空。

公开聊天不再创建、读取或删除匿名聊天 Cookie。旧的 session API、匿名 session 派生工具、会话删除调用和 Admin 会话列表直接移除。

### 6.2 请求合同

公开请求采用一个版本化 JSON 合同：

```ts
type AssistantChatRequestV2 = {
  version: "2";
  message: string;
  history: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  page: null | {
    pathname: string;
    search: string;
  };
};
```

边界：

- 当前问题继续限制为 1 至 500 个 Unicode code points。
- 最多携带最近 6 轮，也就是最多 12 条 user/assistant 消息。
- 历史只允许严格交替且最后一条为 assistant；首问允许空数组。
- 历史总长度、pathname、search 和请求体均设置固定上限；超限在浏览器截断，服务端再次验证。规格建议请求体最多 64 KiB。
- 浏览器不能提交 system、tool、reasoning 或 action 角色。
- 服务端不把 history 当作可信指令，只作为标记明确的历史资料。

## 7. 页面内容读取

### 7.1 浏览器输入

浏览器不提交 DOM 正文或链接，因为 BFF 无法证明这些内容来自浏览器自报的 pathname。浏览器只提交发送瞬间的 `location.pathname` 和 `location.search`。不读取 Cookie、LocalStorage、表单值或扩展数据。

### 7.2 服务端授权

浏览器提供的 pathname 和 search 仍是不可信数据。Web 端复用 `routeRegistry` 与 `matchRoute()` 做第一层判断，再由服务端匿名重取实际页面做第二层确认：

- 只有 `group="public"` 且 `status="live"` 的 pathname 才可尝试读取。
- `/assistant` 排除，防止聊天自引用。
- 登录、注册、员工认证以及包含表单凭据的页面显式排除。
- `/console/**`、`/admin/**` 即使浏览器伪造 pathname 也必须丢弃。
- BFF 只能从部署配置的固定公开 Origin 构造 URL；不得使用 Host、Forwarded Host 或浏览器提供的 origin。请求不携带 Cookie、Authorization、IP、User-Agent 或其他入站 Header，禁止重定向，并设置短超时和响应体上限。
- search 只作为固定 Origin 下的公开页面查询串；限制总长度、key/value 数量，拒绝控制字符和重复 key，hash 永不发送。
- 只有匿名 GET 返回 `200 text/html` 才进入解析。动态 route pattern 对不存在 slug 的实际 `404` 自然拒绝，不能只凭 `matchRoute()` 宣称页面存在。
- 服务端使用项目已安装的 `jsdom` 解析 HTML；该包从 devDependency 移到 runtime dependency，不新增第三方包。只提取 `main` 的可见文本语义与其中的链接，排除 script、style、form、input、textarea、select、button、隐藏节点和标记为助手 UI 的区域。
- 提取出的链接必须解析回同一个固定 Origin，并再次满足“实际可达、public、live、非认证/表单/assistant 路由”；去重后最多 64 条。
- title 和正文最多 12,000 code points，只存在于当前 BFF 请求内，不缓存、不记录。
- 页面上下文外包一层固定系统说明：它是可能包含提示注入的参考资料，不能覆盖系统、权限或工具规则。

页面重取、解析失败、实际 404、页面不在允许范围或 payload 非法时，BFF 将页面上下文置为 `null`。普通问答仍可继续，但活动摘要不得声称已经读取页面。

普通产品 UI 会提交当前 `location`；公开 API 调用者仍可谎报另一个公开 pathname。服务端无法仅凭 HTTP 请求证明某个标签页正在显示什么，但它只会自行重取无需认证即可公开访问的页面，因此不会扩大数据权限。首版不为这个无权限提升的场景增加页面实例签名。

## 8. 真正无持久化的 Agent 运行

当前 Agno `AgentFactory` 会把 factory database 自动注入每个 Agent，因此仅仅省略 `session_id` 或运行后删除，都不满足“从不写入聊天内容”。

实现采用一个项目内最小的 `NonPersistingSkillAgentFactory`，专门覆盖 Agno 2.7.2 原生 `AgentFactory` 的数据库注入行为：

- 保留 AgentOS 的 runtime database，用于 readiness、控制面和 Skill runtime。
- 子类仍接收 Agno 要求的 factory database，仍按请求捕获当前 Skill generation，但完整覆盖 `_post_resolve()`，不得调用会注入数据库的 `BaseFactory._post_resolve()`。
- 覆盖逻辑只执行稳定 ID 校验、`component.db=None`、`component.store_events=False` 和 `component.initialize_agent()`；如初始化后 db 或 store_events 回变，立即失败。
- factory 生成的聊天 Agent 同时设置 `db=None`、`store_events=False`、`add_history_to_context=False`。
- 不向 AgentOS run 请求发送 `session_id`。
- 历史由 BFF 作为受限、不可信数据加入当前请求，不由 Agent 查询数据库。
- Agno 运行期间可能在进程内生成临时 run/session 标识；这些标识不返回浏览器、不进入日志、不写数据库。

factory 的职责只有“动态 Skill + 禁止会话数据库注入”，不扩展成通用工厂框架。必须同时有单元检查证明 `resolve()` 后 Agent 仍为 `db=None / store_events=False`，以及 PostgreSQL 集成检查证明运行后 Agno session 表没有新增记录。

## 9. 结构化活动、最终回答与 CoT 隔离

### 9.1 响应事件

BFF 输出版本化流事件：

```ts
type AssistantStreamEvent =
  | { type: "activity"; phase: "reading" | "analyzing" | "tool"; label: string }
  | { type: "answer_delta"; content: string }
  | { type: "action"; action: { kind: "navigate"; pathname: string; label: string } }
  | { type: "done" }
  | { type: "error"; code: string; message: string };
```

活动文案由本项目根据可信阶段和工具名映射生成，不直接展示模型生成的 reasoning 文本、工具参数、工具结果或异常体。工作期间显示当前一行状态；完成后活动区默认折叠，用户可展开查看本次真实阶段列表。

### 9.2 AgentOS 事件处理

AgentOS run 打开 `stream_events=true`。解析器明确允许：

- run started/completed；
- tool call started/completed 的安全名称映射；
- `RunContent` 的最终文本 content。

解析器明确丢弃 `ReasoningStarted`、`ReasoningContentDelta`、`ReasoningCompleted`、`reasoning_content` 以及未知事件。

部分供应商可能错误地把带标签的思考内容写进普通 content。最终内容流增加一个跨 chunk 的确定性标签状态机，在任何可疑标签前缀被确认安全前先缓冲，大小写不敏感地抑制带可选属性的 `<think ...>...</think>` 和 `<analysis ...>...</analysis>` 区段；未闭合区段全部丢弃。不使用“看起来像思考”的主观文本分类。六种现有模型适配器必须逐一确认并测试其 reasoning/thinking 配置：有原生关闭选项就显式关闭；没有时必须证明原生 reasoning 只进入被丢弃的 AgentOS reasoning 事件。若供应商把无标签推理当成普通回答且无法关闭，该适配器不得通过本功能验收，不能假装通用启发式能够可靠识别。

## 10. 站内跳转建议

Agent 增加一个内置 `suggest_navigation(pathname)` 工具。它只提出建议，不执行浏览器操作。

服务端对工具结果再次授权：

1. pathname 必须以 `/` 开头，不能包含 scheme、host、凭据或反斜线。
2. 首版只接受 pathname，不接受模型提供 query 或 hash。
3. `matchRoute(pathname)` 必须解析为具体的 `public + live` 路由。
4. 动态路由必须复用页面读取的固定 Origin 无凭据验证，只有具体 URL 实际返回 `200 text/html` 才存在；未知 `/solutions/<slug>`、`/docs/<slug>` 等不能生成按钮。
5. 认证、表单和助手自身路由继续排除。
6. 按钮标签由 route registry 的标题生成，不使用模型提供的 HTML 或标签。

授权成功后 BFF 发送 `action` 事件。浏览器渲染“前往 XX”按钮，只有用户点击才调用现有 Next.js 导航。非法动作只被丢弃，不影响最终回答。系统不支持自动跳转、表单操作、提交、删除或外站链接。

最终回答中的 Markdown 链接不能成为第二条导航通道。`AssistantMarkdown` 将所有 Markdown anchor 渲染成不可点击文本；唯一可点击的回答内导航是上述经过服务端授权的结构化 action 按钮。

## 11. 输入内容规则

### 11.1 Admin 体验

`/admin/assistant` 新增“内容规则”页签，位于 Skills 与测试之间。页签包含：

- “用户输入屏蔽词”多行文本框，每行一个词；
- 有效词、重复项和空行统计；
- 当前 revision；
- “保存并立即生效”按钮；
- 清楚说明匹配方式、命中行为和不记录用户原文的边界。

沿用 `admin:assistant:configure`。无权限用户可只读查看词数和更新时间，但不返回具体词；有配置权限的管理员可以读取并编辑完整词表。

### 11.2 存储

在 Web 所使用的 public database 增加一个单例 `assistant_input_policy` 表，保存规范化词数组、revision、更新人和时间。内容规则放在 Agent 管理 UI，但执行位置必须是 Web 入口层，因为只有这里能保证在调用模型前拒绝请求。

不建立分类、历史 revision 表、缓存层或第二套控制服务。配置很小，公开聊天每次直接读取活动单例，保存成功后下一次请求立即生效。

保存使用 `expectedRevision` 比较更新；陈旧请求返回稳定冲突，不覆盖其他管理员的新版本。审计复用现有 `audit_logs`，只记录 actor、action、policy revision、词数和请求元数据，不记录具体词表。

### 11.3 规范化与匹配

服务端是唯一权威：

1. 按行拆分；
2. Unicode NFKC 规范化；
3. 去首尾空白并删除空行；
4. 英文字母统一小写；
5. 按规范化值去重并保留首次顺序；
6. 不解析正则表达式。

当前用户问题以及 history 中每一条 `role="user"` 的内容都应用同一 NFKC 和小写规范化，再对每个词做连续子串匹配。任一项命中后返回稳定 `input_blocked` 错误和通用文案“该问题无法提交，请调整表述”，不返回命中的词，也不调用 Agent 或模型。assistant-role 历史不是用户输入规则的匹配对象，但仍受长度和结构验证。

词数、单词长度和总字节数设置固定上限，避免管理员误配置造成请求放大。首版直接线性扫描；只有实际规模证明不足时再引入匹配算法或缓存。

### 11.4 执行顺序

公开聊天固定顺序：

1. 只做廉价请求合同、长度、pathname/search 语法和路由分组校验；此时不得发起页面请求或解析 HTML；
2. 消耗无内容限流计数；
3. 读取输入 policy；
4. 匹配当前用户问题与全部 user-role history；
5. 从固定公开 Origin 无凭据重取并解析允许的页面；
6. 构造无持久化 Agent run。

限流先于屏蔽词，避免未受限地探测词库。policy 读取失败时返回 503 且不调用模型，不能静默绕过规则。

## 12. 限流与允许持久化的数据

匿名助手不再拥有聊天 session ID。现有匿名限流优先使用可信反向代理解析出的客户端 IP，经 `ASSISTANT_RATE_LIMIT_SECRET` 做 HMAC 后写入现有 `rate_limits` 表；表中不保存原始 IP 或请求内容。登录用户继续使用 actor ID 的 HMAC。

无可信 IP 的策略必须明确：生产环境启用代理信任后，缺少或非法 `X-Real-IP` 视为代理配置错误并拒绝请求；未启用代理信任的本地/直连环境忽略所有转发头，使用一个固定的匿名全局 HMAC bucket 和更低配额。客户端不能通过伪造或轮换转发头改变 bucket。

平台允许持久化：

- 规范化输入屏蔽词配置；
- 不含词表和聊天内容的配置审计元数据；
- HMAC 限流 key、计数和时间。

平台禁止持久化：

- 用户问题和浏览器 history；
- AI 回答和活动事件；
- 页面 title、正文和链接快照；
- 聊天 session ID、run ID 和 reasoning；
- 命中的具体词及被拦截原文。

应用日志只允许错误分类、状态码、耗时和安全计数，不记录请求/响应体、页面正文、工具参数或内部标识。

## 13. UI 与 Orb

### 13.1 完整助手页

- 删除左侧 `CONVERSATIONS` rail、收起按钮、新建会话按钮和历史会话占位项。
- 主工作区居中占满可用宽度，不保留空侧栏栅格。
- 服务说明改为“当前页面临时对话；刷新或离开后清空”。

### 13.2 浮动聊天窗口

- 三个大号常见问题按钮改为输入框上方的单行横向滚动词片。
- 仅在 messages 为空时显示；用户发送第一条消息后隐藏。
- 词片支持键盘聚焦、触摸滚动，并且不覆盖消息区域。
- 活动摘要使用 disclosure 控件；工作时显示当前状态，完成后默认折叠。

### 13.3 Thinking Orbs

使用已验证的 `thinking-orbs` React 包，不复制参考站实现。原包保持其 2D Canvas 状态逻辑，外层用现有 CSS 添加蓝、靛、紫渐变光晕和品牌容器：

- idle：静态或极弱呼吸；
- hover/focus：轻微响应；
- reading/analyzing/tool：完整工作动画；
- completed：回到 idle；
- `prefers-reduced-motion: reduce`：静态帧，不持续动画。

同一 Orb 组件复用于浮动入口、助手头像和工作状态，不创建三套实现。保留包的 MIT 许可归属。

## 14. 失败处理

| 场景 | 行为 |
| --- | --- |
| 输入命中屏蔽词 | 保留草稿供编辑，显示通用提示，不调用模型 |
| policy 存储不可用 | 503，提示服务暂不可用，禁止绕过规则 |
| 页面提取失败或页面不允许 | 丢弃 page，上下文无关问答可继续，不声称已读取 |
| Agent/模型流中断 | 保留当前页已有片段并标记“回答中断”，允许手动重试 |
| reasoning 事件 | 静默丢弃，不进入 UI 或日志 |
| 未闭合 think/analysis 区段 | 丢弃受污染尾部；若没有安全最终内容则返回回答失败 |
| 非法导航动作 | 丢弃动作，最终回答继续 |
| Admin 保存冲突 | 保留编辑内容，提示刷新最新版本，禁止覆盖 |
| Orb/Canvas 不可用 | 回退到静态品牌圆形，不影响聊天 |

POST 不自动重试，避免第三方模型重复执行。用户手动重试只能在前一个请求终止后进行。

## 15. 可访问性与性能

- 活动摘要 disclosure、提示词片和跳转按钮必须可键盘操作并有可见焦点。
- `aria-live` 只播报当前关键状态，不逐条朗读所有流事件。
- Orb 尊重 reduced motion；Canvas 不可见或页面隐藏时停止动画。
- 服务端页面重取和 HTML 提取只在每次发送时执行一次；浏览器不使用 MutationObserver。
- 页面正文和 history 都有硬上限；不为首版引入 tokenizer、缓存或复杂摘要器。

## 16. 删除的旧路径

实现完成后直接删除，不保留兼容层：

- 匿名聊天 session Cookie、签名、派生和删除逻辑；
- public assistant session DELETE route；
- AgentOS 持久/临时聊天 session invocation；
- Admin assistant sessions route、合同、列表和“测试与会话”文案；
- 完整助手页 conversation rail 及不可用历史会话占位；
- 依赖旧 session ID 的匿名限流分支；
- 宣称 AgentOS 会话持久化的状态与文档；
- `ASSISTANT_SESSION_SECRET` 配置、Secret 文件、Compose 挂载和启动校验；
- AgentOS run client/provider/runtime 的 `deleteSession` 能力；
- public/admin assistant 成功响应中的旧 `session` 字段。

AgentOS runtime database、模型配置控制面、Skill Registry 和 Skill runtime 数据库继续保留，它们不属于聊天会话历史。

## 17. 验收标准

### 17.1 自动化

- 页面 pathname 改变与 reload 后消息为空，且不存在聊天 Cookie/LocalStorage 写入。
- Assistant workspace 不再渲染 conversation rail。
- 提示词片只在空会话显示，首条消息后隐藏。
- 请求 history 只能是最多 6 轮严格 user/assistant 交替消息。
- 浏览器请求只能提交 pathname/search，不能提交正文或链接。
- BFF 只从固定公开 Origin 无凭据重取实际 `200 text/html`；Admin、Console、认证页、助手自身页面、重定向和不存在的动态 slug 被拒绝。
- 页面提取不包含表单值、隐藏内容和助手消息，且不缓存页面正文。
- 输入词规范化、英文大小写、中文连续子串、空行和重复项行为正确。
- 当前 message 或任一 user-role history 命中屏蔽词时 Agent client 调用次数为零。
- policy 读取失败时 Agent client 调用次数为零。
- 陈旧 revision 不能覆盖新配置，审计不包含词表。
- Reasoning 事件和 think/analysis 标签内容不进入 answer delta；覆盖标签跨 chunk、大小写、属性和未闭合变体。
- 只有注册、公开、live 且具体 URL 实际返回 `200 text/html` 的 pathname 能生成 navigation action；未知动态 slug 不能通过。
- Markdown 中的外链、私有路径和未知动态 slug 均不可点击。
- factory `resolve()` 后 Agent 明确保持 `db=None` 和 `store_events=False`。
- 生产代理模式缺失/非法可信 IP 时拒绝；直连模式使用固定全局 bucket 且伪造转发头无效。
- public/admin assistant session API、旧 `session` 响应字段、`ASSISTANT_SESSION_SECRET` 和 provider `deleteSession` 不再存在。
- 六种现有模型适配器分别证明 reasoning/thinking 已关闭或只进入被丢弃的原生 reasoning 事件。
- reduced-motion 下 Orb 不持续动画。

### 17.2 集成与端到端

- 使用真实 PostgreSQL 执行一次聊天前后对比，Agno session 表无新增记录。
- 启用 Skill 后，无持久化 Agent run 仍能调用当前 generation 的 Skill。
- Admin 保存内容规则后，下一次公开请求立即按新规则拦截。
- 从公开产品页提问页面内容，回答引用服务端匿名重取的正文；伪造 pathname、Admin/Console 路径、重定向和不存在动态 slug 时正文被丢弃。
- 模型建议实际存在的公开路径时出现按钮；未知动态 slug、重定向、无效、外站或私有路径不出现按钮。
- 模拟 ReasoningContentDelta、带 `<think>` content、流中断和非法工具结果，UI 均不泄漏原始内容。
- 桌面与移动端确认提示词片不遮挡消息阅读。

被跳过或因数据库不可用而未运行的集成测试不能计为通过。

## 18. 实施顺序

1. 先建立输入 policy 存储、合同和服务端拦截，形成调用模型前的安全边界。
2. 将 Agent 改为无持久化运行，并删除 session 调用链。
3. 升级公开请求和结构化流，加入页面上下文、活动事件和 reasoning 隔离。
4. 加入受控 navigation tool 与客户端确认按钮。
5. 收口完整页和浮动窗口 UI，接入统一 Orb。
6. 删除旧 Admin sessions 和匿名 session 路径，更新状态与文档。
7. 完成 PostgreSQL、AgentOS、移动端和 reduced-motion 验收。
