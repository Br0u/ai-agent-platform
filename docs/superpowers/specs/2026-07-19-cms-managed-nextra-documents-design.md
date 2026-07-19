# CMS 管理 Nextra 文档设计

> 日期：2026-07-19  
> 状态：已确认实施  
> 范围：`/admin/docs`、`/docs`、`/docs/[category]`、CMS 文档数据与审计

## 目标

把现有仓库内 MDX 文档迁移为 CMS 可管理内容，同时保留当前 Nextra 文档阅读体验。运营人员可以在 CMS 中创建和编辑草稿、预览、发布、下线和重新发布；游客始终只看到最后一次成功发布的版本。

本设计覆盖一期可用闭环，不扩展多语言、多产品版本、多人实时协作、媒体库、全文搜索引擎或富文本可视化编辑器。

## 现状与决策

当前链路为：

- `apps/web/src/content/*.mdx` 保存正文；
- `apps/web/src/content/_meta.ts` 保存标题和顺序；
- `/docs/[category]` 通过 `nextra/pages#importPage` 编译本地文件；
- `/admin/docs` 只有权限保护的 scaffold；
- PostgreSQL 已有未接入的通用 `content` 表；
- 当前文档页面、导航和样式正在本工作区中调整，本次改造必须保留这些视觉改动。

现有 PRD 规定“正文在仓库，CMS 只管理元数据”。用户已明确授权改为 CMS 管理正文，因此同步修改 PRD，以数据库发布版本为唯一公开内容源。

## 方案比较

### 方案 A：Git 型 CMS

CMS 修改 MDX 文件并提交 Git，部署流水线重新构建站点。优点是版本审查天然复用 Git；缺点是生产服务需要仓库写权限，发布速度依赖构建，失败边界跨越 CMS、Git 和部署系统，不适合当前自建运营后台。

### 方案 B：数据库正文 + 安全 Markdown AST（采用）

CMS 把正文、元数据和不可变修订保存到 PostgreSQL。公开页读取明确的已发布修订，通过受限 Markdown AST 生成 React 元素，并复用 Nextra 的展示组件和现有文档样式。优点是草稿与线上版本隔离、发布即时、权限和审计边界清晰，同时不执行 CMS 提交的代码。

### 方案 C：CMS 只管理元数据

保持正文由 Git 管理，仅把标题、摘要和导航顺序写入数据库。实现成本最低，但无法满足“在 CMS 进行文档内容管理”的目标。

## 内容安全与渲染边界

正文使用“Markdown + 受控容器指令”，不接受 MDX：

- 支持标准 Markdown、GFM 表格、任务列表、链接、代码块和标题目录；
- 支持 `callout`、`steps`、`cards` 和 `filetree` 四种受控指令，渲染为白名单 Nextra 组件或等价的现有样式；
- 使用同一套 `unified + remark-parse + remark-gfm + remark-directive` 解析链路完成校验、TOC 提取和渲染；
- 禁止原始 HTML、MDX JSX、ESM、JavaScript 表达式、事件属性、style、spread 和未知指令；
- 指令属性逐项使用 schema 校验；链接和图片仅接受站内绝对路径、锚点以及 `https:`，图片仅接受站内 `/assets/` 路径；
- 服务端在保存草稿和发布前都执行同一套解析与校验；
- 解析或渲染失败只返回稳定错误码，不保存无效修订，也不泄露源码或内部异常；
- 内容字节数、AST 节点数、嵌套深度、标题数量、代码块长度、标题、摘要、slug 和导航顺序均有硬限制；
- 渲染过程不使用 `eval`、`Function`、`dangerouslySetInnerHTML`、`MDXRemote` 或运行时 MDX 编译，因此不需要放宽 CSP 的 `script-src`。

现有 Callout、Steps、Cards 和 FileTree 在迁移时转换为等价指令。Nextra 继续提供组件和文档视觉能力，但不再承担动态源码执行。

## 数据模型

继续使用 `content` 作为当前草稿和生命周期记录，并新增不可变修订表。

### `content`

保留现有字段并增加：

- `revision`：当前草稿修订号，从 1 递增；
- `published_revision`：当前公开修订号，可为空；
- `row_version`：所有写操作共享的并发控制版本；
- `published_by`：最近发布操作者；
- `archived_at`、`archived_by`：最近下线时间和操作者。
- `deleted_at`、`deleted_by`：软删除时间和操作者。

文档记录固定 `type = "document"`。`body` 使用经过运行时校验的 JSON：

```ts
{
  format: "safe-markdown-v1";
  source: string;
  renderModel: {
    version: 1;
    root: SafeHastRoot;
    toc: Heading[];
  };
  navigation: {
    label: string;
    code: string;
    position: number;
  };
}
```

保存草稿时，服务端把 Markdown 解析为 MDAST，经指令转换和 `rehype-sanitize` 生成受限 HAST，再把 `source + renderModel` 一起写入修订。公开请求不重新解析或编译源码，只校验 render model 的版本和节点 schema，然后通过 `hast-util-to-jsx-runtime` 映射到 React/Nextra 白名单组件。解析器升级不会改变既有发布修订；新增 render model 版本必须保留旧版本 renderer 或执行显式迁移。

`content` 中的 `title`、`summary` 和 `body` 始终表示最新草稿。已发布文档继续允许保存新草稿，此时 `revision > publishedRevision`，公开页仍读取旧的已发布修订。

### `content_revisions`

每次成功创建或保存草稿都追加一条不可变快照：

- `content_id`；
- `revision`；
- `slug`、`title`、`summary`、`body`；
- `created_by`、`created_at`；
- 唯一约束 `(content_id, revision)`。

公开查询用 `content.id + content.published_revision` 精确读取快照，正文、slug 和导航信息均来自同一个发布快照，绝不读取可变草稿字段。

数据库把修订不可变性作为权限边界，而非仅依赖服务代码：FK 使用 `ON DELETE RESTRICT`；`ai_agent_runtime` 对 `content_revisions` 只有 `SELECT, INSERT`，没有 `UPDATE, DELETE, TRUNCATE`。角色授权脚本在通用表授权之后显式收紧该表，并通过真实 runtime role 集成测试验证。

`content` 只允许软删除，runtime 不拥有该表的 `DELETE` 或 `TRUNCATE`；物理删除不属于应用运行时能力。

`content.(id, published_revision)` 使用复合外键引用 `content_revisions.(content_id, revision)`，数据库保证发布指针存在且属于同一篇文档。

### `content_routes`

文档 slug 使用独立注册表保证草稿和线上 URL 隔离：

- `slug` 为主键，全局保留，避免旧 URL 被其他内容占用；
- `content_id` 指向文档；
- `state` 为 `reserved`、`canonical` 或 `alias`；
- 每篇已发布文档最多一个 `canonical` 路由。

新建或修改草稿 slug 时先注册 `reserved` 路由，不影响线上。发布时，当前 canonical 路由变为 alias，发布修订中的 slug 原子切换为 canonical。访问 alias 时永久重定向到 canonical；reserved 路由不公开。

`content_routes` 禁止物理删除和跨文档改绑。数据库触发器要求新路由只能以 `reserved` 插入，只允许 `reserved → canonical` 和 `canonical → alias`，禁止 alias 回退为 canonical；初始 seed 也先插入 reserved 再切换。已经成为 alias 的 slug 永久保留且不能再次作为新 canonical。FK 使用 `ON DELETE RESTRICT`，partial unique index 保证每篇文档最多一个 canonical。runtime 只获得 `SELECT`、受限 `INSERT` 和 `UPDATE(state)`，不获得 `DELETE` 或 `UPDATE(content_id, slug)`。migration/grant 集成测试以真实 runtime role 验证直接插入 canonical、删除、改绑和非法状态回退均失败。

### 并发控制

编辑表单提交 `expectedRevision` 和 `expectedRowVersion`。保存草稿时两者都必须匹配；发布、下线、软删除和恢复至少校验 `expectedRowVersion` 及允许的源状态。每个成功写操作递增 `rowVersion`；不匹配时返回 `DOCUMENT_REVISION_CONFLICT`，不覆盖并发修改。

## 服务边界

新增独立文档域模块，避免把逻辑继续堆进通用 `server/admin/actions.ts`：

- `packages/document-content`：无 Next.js 依赖的输入限制、Markdown 解析、指令转换、sanitize、资源限制、render model 类型和生成器；
- `server/documents/contracts.ts`：文档 DTO 和 Web action 契约；
- `components/documents/safe-document-renderer.tsx`：版本化 HAST schema 校验和 React/Nextra 白名单组件映射；
- `server/documents/repository.ts`：数据库查询和事务写入；
- `server/documents/service.ts`：创建、保存、发布、下线、列表和公开读取；
- `server/documents/actions.ts`：CMS Server Actions、鉴权、重验证和稳定错误映射。

普通草稿保存要求 `admin:docs`，并在同一写事务中重新执行权威权限 EXISTS 查询。发布和下线属于外部可见变更，额外要求近期密码和 MFA 验证。软删除和从软删除恢复要求仅授予超级管理员的 `admin:docs:delete`，同时要求近期密码和 MFA。任何浏览器传入的操作者、状态、修订号或返回地址都不作为授权事实。

允许的状态转换为：新建到 `draft`；`draft|archived|published` 可发布为 `published`；仅 `published` 可下线为 `archived`；任意未删除状态可软删除并强制变为 `archived`；软删除恢复后保持 `archived`，必须再次显式发布。重复发布同一修订、重复下线或发布已删除内容返回稳定状态冲突，不伪装成功。

## 页面与数据流

### CMS `/admin/docs`

页面由服务端读取文档列表和选中的草稿。首期提供：

- 新建文档；
- 按状态查看文档；
- 编辑 slug、标题、摘要、导航标题、导航编号、排序和正文；
- 保存草稿；
- 在新标签页预览指定草稿修订；
- 发布当前修订；
- 下线当前文档；
- 超级管理员软删除和恢复；
- 查看当前草稿修订和已发布修订是否一致。

预览路由受 `admin:docs` 保护，并通过不可猜测的登录会话访问，不生成公开预览令牌。

### 公开 `/docs`

文档首页从数据库读取所有 `status = published` 且有 `published_revision` 的文档，使用发布快照中的导航信息排序并生成卡片。未发布、下线和软删除内容不进入导航。

### 公开 `/docs/[category]`

按 slug 查询 canonical 或 alias 路由。alias 永久重定向到 canonical；canonical 精确读取已发布快照，找不到时返回 404。服务端读取并校验发布修订内的版本化 HAST render model，映射为 React 元素和 TOC，再交给现有 `DocsDetailLayout`；请求路径不解析 Markdown，也不执行生成代码。上一篇、下一篇和侧栏使用同一批已发布导航数据，避免静态列表与正文状态不一致。

### 缓存

公开列表和按 slug 查询通过 Next.js 16 `unstable_cache` 缓存，统一使用 `documents` tag，函数参数仍参与 cache key。发布、下线、删除或恢复事务成功后，Server Action 调用 `updateTag("documents")` 获得 read-your-own-writes 语义，并 `revalidatePath("/docs", "layout")`；不得使用缺少 profile 的旧式 `revalidateTag(tag)`。草稿保存只刷新 CMS，不失效公开缓存。

## 初始迁移

迁移分为四个可回滚阶段：

1. 增加 schema、权限和幂等 backfill，旧应用仍从本地 MDX 读取；
2. 上线领域服务、安全 Markdown 渲染和 CMS，公开页仍保持旧读链路；
3. 验证七篇发布快照后切换公开读链路，保留上一版本应用镜像；
4. 稳定观察后移除新版本中的本地 MDX 入口。

七篇初始内容通过构建期生成器固化到 Drizzle SQL migration，生产 migrator 不读取 `apps/web`，也不在数据库中执行 TypeScript：

1. front matter 写入 `title` 和 `summary`；
2. 删除 import 行，并把白名单 Nextra JSX 转换为受控 Markdown 指令；
3. `packages/document-content` 中的生成器对转换结果调用和 CMS 保存完全相同的 parser，生成版本化 HAST、TOC 和 source/renderModel checksum；
4. 按现有 `_meta.ts` 顺序写入导航位置；
5. 为每篇文档创建 revision 1，并直接标记为已发布；
6. 使用固定 UUID 和 slug；若固定 ID 或 slug 被不同内容占用，migration 明确失败，不静默覆盖。

生成器输出并提交固定的 `0007_cms_document_seed.sql`；schema 和约束由前一个 `0006` migration 建立。仓库保留只用于重现历史 migration 的安全 Markdown seed fixture，不参与任何运行时读取。测试在临时目录重新生成 SQL，并与提交文件逐字节比较，防止 fixture、正式 parser、checksum 和 migration 漂移。生产 migration 只写入已生成并评审过的 JSON/SQL 产物。

初始记录允许 `created_by` / `published_by` 为空，表示系统迁移；后续人工操作必须有操作者。

上线前先生成数据库备份并记录七篇源文件 checksum。部署顺序为备份 → migration/backfill → 数据校验 → 新 Web 镜像 → CMS/公开 smoke。migration 失败时不切换 Web；新 Web 验收失败时恢复上一镜像，旧镜像继续读取自带 MDX，新增表保持向后兼容且不执行破坏性回退。数据库内 CMS 写入不会被删除，修复后可再次切换。切换验收必须确认七篇记录、七个 published revision、七个 canonical route、内容 checksum 和公开 HTTP 结果。

## 审计

扩展现有强类型审计事件：

- `document.created`；
- `document.draft_saved`；
- `document.published`；
- `document.archived`；
- `document.deleted`；
- `document.restored`。

元数据只记录 slug、修订号和结果，不写正文、摘要或其他可能包含敏感信息的内容。创建、保存、发布、下线、删除和恢复的业务写入、事务内权威权限复核与审计写入全部使用同一个数据库事务；审计失败时业务操作回滚。现有 audit repository 将支持显式注入 transaction-scoped database，并增加 `document` target 类型。

## 错误处理

域服务返回稳定错误码：

- `DOCUMENT_INPUT_INVALID`；
- `DOCUMENT_SOURCE_UNSAFE`；
- `DOCUMENT_NOT_FOUND`；
- `DOCUMENT_SLUG_CONFLICT`；
- `DOCUMENT_REVISION_CONFLICT`；
- `DOCUMENT_NOT_PUBLISHABLE`；
- `DOCUMENT_STATE_CONFLICT`；
- `AUTH_PERMISSION_DENIED`；
- `AUTH_REAUTH_REQUIRED` / `AUTH_MFA_REQUIRED`。

CMS 显示针对性提示。公开读取的数据库错误显示通用暂不可用状态，不暴露内部异常；未发布或不存在统一返回 404。

## 测试与验收

采用测试先行，至少覆盖：

1. Markdown AST 接受标准 Markdown 和受控指令，拒绝 HTML、MDX、未知指令、危险 URL、越界属性、过深/过大 AST，并证明渲染链路不使用动态代码执行；
2. 服务层创建、保存、CAS 冲突、发布、草稿不污染线上、下线、软删除和恢复；
3. 每个写事务重复权威 `admin:docs` 权限检查；
4. 发布/下线要求近期 MFA，删除/恢复还要求 `admin:docs:delete`，失败时不写数据库；
5. 公开查询只返回发布修订并按发布导航排序；
6. CMS 页面可访问性、表单状态和错误提示；
7. `/docs` 卡片、侧栏、上一篇/下一篇和 TOC 使用动态发布数据；
8. 数据库迁移可从空库执行，约束和索引正确；
9. 真实 runtime role 不能更新/删除修订、删除/改绑路由或执行非法路由状态回退；
10. seed 生成器输出与已提交 SQL 逐字节一致，现有七篇文档迁移后逐页渲染，旧 slug 在改名发布后永久重定向；
11. web 与共享包单测、类型检查、lint、格式检查和生产构建通过。

浏览器验收至少覆盖 1440px 和 390px：CMS 编辑/发布闭环、公开文档切换、下线后 404、重新发布恢复、无权限访问被拒绝，且控制台无错误。

## 非目标

- 任意 JavaScript 或任意 React 组件；
- WYSIWYG 富文本编辑器；
- 图片上传与媒体库；
- 定时发布；
- 多语言和产品版本分支；
- 外部 Git 同步；
- Elasticsearch 等独立搜索服务；
- 硬删除。

## 完成标准

- CMS 可以完成真实文档创建、草稿保存、预览、发布、下线，以及超级管理员软删除和恢复；
- 公开页面只渲染明确发布的不可变修订；
- 当前七篇文档无内容丢失并可从 CMS 继续编辑；
- 所有写操作具备事务内授权、修订冲突保护和审计；
- CMS 输入只经过安全 Markdown AST 渲染，不能执行 JavaScript、HTML 或任意 React 组件；
- 现有文档视觉布局和响应式行为不回退；
- 不再存在仓库 MDX 与数据库正文两个权威来源。
