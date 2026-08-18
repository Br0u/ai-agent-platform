# 官网入口调整与安装包资源支持 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 隐藏官网 1.0 的申请体验入口，完成指定文案与下载中心内容调整，并把现有 PDF 下载资源管理扩展为可发布 Windows/macOS 安装包的统一资源系统。

**Architecture:** 资源身份增加不可变的 `document | software` 类型，资源修订通过通用附件表持有 PDF、Windows 或 macOS 文件。现有草稿、显式发布、审计、乐观并发、持久化文件卷与公开下载链路继续作为唯一实现；PDF 保持封面与站内预览，软件以一个统一版本号和最多两个平台附件直接下载。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、Drizzle ORM/PostgreSQL 18、Zod 4、Node.js streams/crypto/fs、`@fastify/busboy`、PDF.js/Poppler/Sharp、Vitest/Testing Library、Playwright、Nginx、Docker Compose。

**Source spec:** `docs/superpowers/specs/2026-08-18-portal-download-installer-support-design.md`

**Required execution skills:** `@superpowers:using-git-worktrees`、`@superpowers:subagent-driven-development`、`@superpowers:test-driven-development`、`@superpowers:systematic-debugging`、`@playwright`、`@superpowers:verification-before-completion`、`@git-guide`。

---

## Chunk 1: 隔离工作区、数据模型与合同

### Task 0: 创建专用实现 worktree

**Files:**
- Verify only: `.gitignore`
- Worktree: `.worktrees/download-installer-support`

- [ ] **Step 1: 检查当前分支和工作区边界**

Run:

```bash
git status --short --branch
git log -5 --oneline
git worktree list
```

Expected: 当前主工作区仍包含用户已有改动；设计提交 `7b77ea35`、`283a7aba`、`a1dc3edf` 位于当前 HEAD 历史中。不得 stash、reset、clean 或提交这些已有改动。

- [ ] **Step 2: 按 worktree 技能创建实现分支**

Run from the repository root:

```bash
git worktree add .worktrees/download-installer-support -b brou/download-installer-support a1dc3edf
```

Expected: 新 worktree 创建成功；分支名为 `brou/download-installer-support`。

- [ ] **Step 3: 验证隔离和依赖**

Run:

```bash
git -C .worktrees/download-installer-support status --short --branch
pnpm --dir .worktrees/download-installer-support install --frozen-lockfile
```

Expected: worktree 初始状态干净；锁文件不变化；安装不新增依赖。本计划使用 Node 标准库完成文件特征校验。

### Task 1: 扩展数据库以容纳通用附件

**Files:**
- Modify: `packages/database/src/schema/download-resources.ts`
- Modify: `packages/database/src/schema/download-resources.test.ts`
- Create: `packages/database/drizzle/0012_download_resource_artifacts.sql`
- Create: `packages/database/drizzle/meta/0012_snapshot.json`
- Modify: `packages/database/drizzle/meta/_journal.json`
- Modify: `packages/database/src/migrate.integration.test.ts`
- Modify: `apps/web/src/server/downloads/repository.ts`
- Modify: `apps/web/src/server/downloads/repository.test.ts`

- [ ] **Step 1: 先写 schema 失败测试**

在 `download-resources.test.ts` 断言：

```ts
expect(downloadResourceKind.enumValues).toEqual(["document", "software"]);
expect(downloadArtifactSlot.enumValues).toEqual([
  "document",
  "windows",
  "macos",
]);
expect(getTableConfig(downloadResourceArtifacts).columns.map(({ name }) => name))
  .toEqual([
    "id",
    "revision_id",
    "revision_kind",
    "slot",
    "object_key",
    "original_filename",
    "extension",
    "media_type",
    "byte_size",
    "sha256",
    "page_count",
    "cover_object_key",
    "created_at",
  ]);
expect(getTableConfig(downloadResources).columns.map(({ name }) => name))
  .toContain("kind");
```

同时断言资源 `(id, kind)`、修订 `(id, resource_kind)` 复合唯一键/外键和以下稳定命名约束：资源类型不可变触发器；扩展态的两个 kind 列临时默认 `document`；document 修订没有版本且 `preview_policy/download_policy` 均非空；software 修订 `preview_policy IS NULL`、`download_policy='public'`、版本非空、去首尾空白且无控制字符；附件 `byte_size > 0`、`sha256` 为 64 位小写十六进制；document 只允许 `.pdf`/`application/pdf` 且页数、封面齐全；Windows 仅允许 `.exe`/`.msi`/`.zip` 与对应 MIME；macOS 仅允许 `.dmg`/`.pkg`/`.zip` 与对应 MIME；软件附件页数、封面必须为空。

- [ ] **Step 2: 运行 schema 测试并确认失败**

Run:

```bash
pnpm --filter @ai-agent-platform/database test -- src/schema/download-resources.test.ts
```

Expected: FAIL，因为新枚举、附件表和 `kind` 尚不存在。

- [ ] **Step 3: 实现最小 Drizzle schema**

在 `download-resources.ts`：

```ts
export const downloadResourceKind = pgEnum("download_resource_kind", [
  "document",
  "software",
]);

export const downloadArtifactSlot = pgEnum("download_artifact_slot", [
  "document",
  "windows",
  "macos",
]);
```

资源表增加非空不可变 `kind`；修订表增加 `resourceKind`、可空 `releaseVersion`，并把 `previewPolicy` 改为可空；附件表按规格保存对象键与元数据。为保持每个计划提交可编译且现有 document-only insert 不必同步修改，两个 kind 列在扩展态临时默认 `document`；Task 6 在所有调用切换后删除默认值和 PDF 专用列。这两个迁移只会在同一次停机发布中一起执行，不形成线上兼容路径。使用数据库检查表达：

```sql
(revision_kind = 'document' AND slot = 'document'
  AND extension = '.pdf' AND media_type = 'application/pdf'
  AND page_count IS NOT NULL AND cover_object_key IS NOT NULL)
OR
(revision_kind = 'software' AND (
    (slot = 'windows' AND (
      (extension = '.exe' AND media_type = 'application/vnd.microsoft.portable-executable') OR
      (extension = '.msi' AND media_type = 'application/x-msi') OR
      (extension = '.zip' AND media_type = 'application/zip')
    )) OR
    (slot = 'macos' AND (
      (extension = '.dmg' AND media_type = 'application/x-apple-diskimage') OR
      (extension = '.pkg' AND media_type = 'application/vnd.apple.installer+xml') OR
      (extension = '.zip' AND media_type = 'application/zip')
    ))
  ) AND page_count IS NULL AND cover_object_key IS NULL)
```

不要增加兼容 getter、旧字段映射或第二套 artifact 模型。

由于 `previewPolicy` 从此可空，同一任务在现有 document-only repository mapper 中查询 `resourceKind`，并在进入旧 DTO 前明确拒绝非 document 或空 preview policy；Task 6 用 discriminated mapper 替换并删除这段过渡 guard。不要用 `!`、类型断言或把 `NULL` 静默改成 `public`。

- [ ] **Step 4: 写迁移集成失败测试**

更新 `migrate.integration.test.ts`：先在仅执行到 `0011` 的数据库中插入一条字段齐全的旧 PDF 修订并把它设为某资源的 draft，再执行 `0012`。迁移后查询并断言：

```ts
expect(kindByKey.get("mdd2-client")).toBe("software");
expect([...kindByKey.entries()].filter(([key]) => key !== "mdd2-client"))
  .toEqual(seededResourceKeys
    .filter((key) => key !== "mdd2-client")
    .sort()
    .map((key) => [key, "document"]));
expect(migratedArtifacts.every((artifact) =>
  artifact.slot === "document" &&
  artifact.originalFilename === `${artifact.resourceKey}.pdf` &&
  artifact.mediaType === "application/pdf"
)).toBe(true);
expect(migratedArtifacts).toContainEqual(expect.objectContaining({
  resourceKey: seededLegacyResourceKey,
  objectKey: seededLegacyPdfObjectKey,
}));
```

测试还要插入一条成功的软件修订 fixture：公共元数据齐全、`resource_kind='software'`、`preview_policy=NULL`、`download_policy='public'`、版本合法。再直接尝试并拒绝：已有资源类型切换（包括没有 published/draft 指针的 `mdd2-client`）、document+windows、software+document、平台与扩展名/MIME 错配、非正大小、非法 SHA、无版本软件修订、软件带 preview policy、带版本文档修订。逐个断言除 `mdd2-client` 外的种子资源均为 `document`。

- [ ] **Step 5: 运行迁移测试并确认失败或显式跳过**

Run:

```bash
RUN_DOWNLOAD_RESOURCE_DB_TEST=true TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/database test -- src/migrate.integration.test.ts
```

Expected: 有安全测试数据库时 FAIL；没有 `TEST_DATABASE_URL` 时必须报告 blocked，不能把 skip 记为通过。

- [ ] **Step 6: 编写原子迁移**

`0012_download_resource_artifacts.sql` 必须按顺序：

1. 建枚举；给资源 `kind` 和修订 `resource_kind` 增加临时 `DEFAULT 'document'`；增加 `release_version`；解除 `preview_policy NOT NULL`；建立附件表与复合约束。
2. 将 `mdd2-client` 设为 `software`，其余资源设为 `document`。
3. 回填所有修订类型。
4. 将非空 PDF 字段迁移为 `document` 附件，`original_filename=resource.key || '.pdf'`。
5. 验证迁移行数等于旧的完整 PDF 修订数。
6. 设定非空约束，建立复合外键、附件检查约束与阻止 `download_resources.kind` 更新的触发器。
7. 保留旧 PDF 列到 Task 6；新代码不得再写入它们。

先运行 `pnpm --filter @ai-agent-platform/database db:generate -- --name download_resource_artifacts`，再把生成的 `0012_download_resource_artifacts.sql` 修成上述回填顺序并核对 `meta/0012_snapshot.json`；确认 `_journal.json` 只有一个 idx 12 条目。迁移必须能在一个数据库事务内回滚；快照必须与本任务的扩展态 schema 一致。

- [ ] **Step 7: 运行数据库检查**

Run:

```bash
pnpm --filter @ai-agent-platform/database test -- src/schema/download-resources.test.ts
RUN_DOWNLOAD_RESOURCE_DB_TEST=true TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/database test -- src/migrate.integration.test.ts
pnpm --filter @ai-agent-platform/database typecheck
pnpm --filter @ai-agent-platform/database lint
pnpm --filter @ai-agent-platform/database exec drizzle-kit check
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/repository.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: 全部 PASS；数据库集成测试若缺少 URL，明确保持未验证状态。

- [ ] **Step 8: 提交数据库扩展态**

```bash
git add packages/database/src/schema/download-resources.ts packages/database/src/schema/download-resources.test.ts packages/database/drizzle/0012_download_resource_artifacts.sql packages/database/drizzle/meta/0012_snapshot.json packages/database/drizzle/meta/_journal.json packages/database/src/migrate.integration.test.ts apps/web/src/server/downloads/repository.ts apps/web/src/server/downloads/repository.test.ts
git commit -m "feat(downloads): add typed revision artifacts"
```

### Task 2: 把下载资源合同改为 discriminated union

**Files:**
- Modify: `apps/web/src/server/downloads/contracts.ts`
- Modify: `apps/web/src/server/downloads/contracts.test.ts`

- [ ] **Step 1: 写合同失败测试**

在保留当前导出供尚未切换的调用方编译的前提下，先增加带 `typed` 前缀的新合同及精确 DTO 示例：

```ts
expect(typedDownloadResourcePublicDtoSchema.parse({
  kind: "software",
  key: "mdd2-client",
  name: "码里奥桌面客户端",
  product: "码里奥",
  category: "software",
  resourceType: "桌面客户端",
  description: "企业级智能编码客户端",
  sortOrder: 20,
  releaseVersion: "v2.0.0",
  platforms: {
    windows: { filename: "mario.exe", byteSize: 240_000_000, downloadUrl: "/api/v1/downloads/mdd2-client/download/windows" },
    macos: null,
  },
  updatedAt: "2026-08-18T00:00:00.000Z",
})).toMatchObject({ kind: "software", releaseVersion: "v2.0.0" });
```

同时测试创建输入必须带不可变 `kind`；文档 DTO 保留 `coverUrl/pageCount/previewPolicy/downloadPolicy`；软件拒绝 `previewPolicy`、空版本、控制字符、两个平台都为空；后台资源 DTO 顶层暴露 `kind` 且附件暴露 `sha256/mediaType/extension`，公开 DTO 不暴露对象键和 SHA。

- [ ] **Step 2: 运行合同测试并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/contracts.test.ts
```

Expected: FAIL，当前 DTO 仍是 PDF-only。

- [ ] **Step 3: 实现 document/software 合同**

定义：

```ts
const artifactSlotSchema = z.enum(["document", "windows", "macos"]);
const releaseVersionSchema = z.string().trim().min(1).max(40)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
```

使用 `z.discriminatedUnion("kind", [...])` 构建 `typedCreateDownloadResourceInputSchema`、修订、后台与公开 DTO。typed draft schema 由共享的 `name/product/category/resourceType/description/sortOrder` 元数据与 kind 分支组合：document 增加现有权限字段；software 增加 `releaseVersion`，不接受 preview/download policy，服务端固定公开下载。当前 PDF-only 导出只作为本地提交序列的临时编译边界：Task 6 让 backend 使用 typed internal contract，Task 8 删除 admin facade，Task 9 删除 public facade；均不得部署中间态。

- [ ] **Step 4: 运行合同与格式检查**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/contracts.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交合同**

```bash
git add apps/web/src/server/downloads/contracts.ts apps/web/src/server/downloads/contracts.test.ts
git commit -m "refactor(downloads): model document and software resources"
```

## Chunk 2: 文件校验、上传、生命周期与 HTTP

### Task 3: 实现受限文件类型识别

**Files:**
- Create: `apps/web/src/server/downloads/artifact-file.ts`
- Create: `apps/web/src/server/downloads/artifact-file.test.ts`

- [ ] **Step 1: 写每种格式的最小失败测试**

用小型 Buffer fixture 覆盖：PDF `%PDF-`、EXE `MZ`、MSI CFB、ZIP 三种 PK 头、DMG 末尾 512 字节 `koly`、PKG `xar!`。测试槽位/扩展名错配和伪扩展名。

```ts
expect(detectArtifact({ slot: "windows", filename: "mario.exe", prefix: Buffer.from("MZ"), suffix: Buffer.alloc(512) }))
  .toEqual({ extension: ".exe", mediaType: "application/vnd.microsoft.portable-executable" });
expect(() => detectArtifact({ slot: "macos", filename: "fake.dmg", prefix: Buffer.from("MZ"), suffix: Buffer.alloc(512) }))
  .toThrow("INVALID_DOWNLOAD_ARTIFACT");
```

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/artifact-file.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 用标准库实现最小识别器**

导出固定映射、文件名清理、槽位/扩展名检查和 prefix/suffix magic 检查。不要解压 ZIP，不要调用外部程序，不要信任上传 MIME。

- [ ] **Step 4: 运行测试并提交**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/artifact-file.test.ts
git add apps/web/src/server/downloads/artifact-file.ts apps/web/src/server/downloads/artifact-file.test.ts
git commit -m "feat(downloads): validate supported artifact formats"
```

### Task 4: 新增通用流式上传 parser

**Files:**
- Create: `apps/web/src/server/downloads/artifact-upload.ts`
- Create: `apps/web/src/server/downloads/artifact-upload.test.ts`
- Verify unchanged until Task 7: `apps/web/src/server/downloads/pdf-upload.ts`
- Verify unchanged until Task 7: `apps/web/src/server/downloads/pdf-upload.test.ts`

- [ ] **Step 1: 移植现有安全测试并增加安装包边界**

保留 multipart 格式、单文件、流式 SHA-256、取消、超限、截断、清理失败测试；增加按槽位限制：document 200 MiB，windows/macos 1 GiB，以及保存前缀/后缀供 Task 3 校验。

- [ ] **Step 2: 运行新测试并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/artifact-upload.test.ts
```

Expected: FAIL，新 parser 不存在。

- [ ] **Step 3: 重命名并泛化现有 parser**

复用 `@fastify/busboy`、Node streams/crypto/fs；只接受 form field `artifact`。导出：

```ts
readBoundedArtifactUploadMultipart(request, store, slot)
// => { stage, byteSize, sha256, originalName, extension, mediaType }
```

流完成后从暂存文件读取受限 prefix/suffix 并调用 `detectArtifact`。导出统一的 `artifactUploadErrorCode(error)`：识别 parser 的 `invalid_multipart/invalid_file/file_too_large`，并递归识别 parser、`createStage`、`commit`、PDF 封面派生及 cleanup AggregateError 中的 `ENOSPC` 为 `insufficient_storage`。现有路由仍直接使用 `pdf-upload`；本任务不改它、不增加转发导出。Task 7 在调用方原子切换时删除旧模块。

- [ ] **Step 4: 运行测试与类型检查**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/artifact-upload.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交通用 parser**

```bash
git add apps/web/src/server/downloads/artifact-upload.ts apps/web/src/server/downloads/artifact-upload.test.ts
git commit -m "feat(downloads): stream generic resource artifacts"
```

### Task 5: 泛化文件存储与下载响应

**Files:**
- Modify: `apps/web/src/server/downloads/file-store.ts`
- Modify: `apps/web/src/server/downloads/file-store.test.ts`
- Create: `apps/web/src/server/downloads/artifact-response.ts`
- Create: `apps/web/src/server/downloads/artifact-response.test.ts`
- Verify unchanged until Task 7: `apps/web/src/server/downloads/pdf-response.ts`
- Verify unchanged until Task 7: `apps/web/src/server/downloads/pdf-response.test.ts`

- [ ] **Step 1: 写失败测试**

测试通用 `createStage` 只接受 `.pdf/.webp/.exe/.msi/.zip/.dmg/.pkg`。document 继续使用唯一规范路径 `objects/{resourceId}/{revisionId}.pdf|.webp`，因此 0012 迁移行与磁盘文件都不需要搬迁；Windows/macOS 使用 `objects/{resourceId}/{revisionId}-{slot}{extension}`。每次上传先生成全新 revision UUID；拒绝 caller path、复用 stage、已存在目标、slot/extension 错配。增加 `inspect(objectKey, expectedByteSize?)`：主 PDF/安装包传 expected size 并精确校验，cover 因数据模型不存独立大小只校验存在且为常规文件。响应测试保留 GET/HEAD/Range/416、UTF-8 filename、`nosniff/no-store`，并加入固定 installer MIME 和主文件大小不符时拒绝响应。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/file-store.test.ts src/server/downloads/artifact-response.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 最小实现通用响应模块**

把现有 `createStage` 直接扩展为全部受支持扩展名，作为唯一暂存 API；新增 `commitArtifact/inspect`，现有 `commit({ kind: "pdf" | "cover" })` 保持到 Task 7，保证当前 service 与 PDF tools 可编译。`artifactResponse` 接受受限 `contentType` 字面量 union 和可选 expected byte size，不接受任意字符串；主 PDF/安装包必须传大小，cover 省略大小。保留现有文件打开后的 inode/size 安全检查和 stream close 行为。现有路由仍直接使用 `pdf-response`；Task 7 切换 import 后删除旧 commit API 和模块。

- [ ] **Step 4: 运行测试并提交**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/file-store.test.ts src/server/downloads/artifact-response.test.ts
pnpm --filter @ai-agent-platform/web typecheck
git add apps/web/src/server/downloads/file-store.ts apps/web/src/server/downloads/file-store.test.ts apps/web/src/server/downloads/artifact-response.ts apps/web/src/server/downloads/artifact-response.test.ts
git commit -m "feat(downloads): store and serve typed artifacts"
```

### Task 6: 改造 repository/service 生命周期

**Files:**
- Modify: `packages/database/src/schema/download-resources.ts`
- Modify: `packages/database/src/schema/download-resources.test.ts`
- Create: `packages/database/drizzle/0013_remove_download_pdf_columns.sql`
- Create: `packages/database/drizzle/meta/0013_snapshot.json`
- Modify: `packages/database/drizzle/meta/_journal.json`
- Modify: `packages/database/src/migrate.integration.test.ts`
- Modify: `apps/web/src/server/downloads/contracts.ts`
- Modify: `apps/web/src/server/downloads/contracts.test.ts`
- Modify: `apps/web/src/server/downloads/repository.ts`
- Modify: `apps/web/src/server/downloads/repository.test.ts`
- Modify: `apps/web/src/server/downloads/repository.postgres.integration.test.ts`
- Modify: `apps/web/src/server/downloads/service.ts`
- Modify: `apps/web/src/server/downloads/service.test.ts`
- Modify: `apps/web/src/server/downloads/actions.ts`
- Modify: `apps/web/src/server/downloads/actions.test.ts`
- Modify: `apps/web/src/server/downloads/server-actions.ts`

- [ ] **Step 1: 写生命周期失败测试**

至少覆盖：

```ts
it.each([
  ["windows", null],
  [null, "macos"],
  ["windows", "macos"],
])("publishes software with any available platform", async (windows, macos) => {});

it("rejects software publish with zero artifacts", async () => {});
it("clones artifact metadata rows without copying objects", async () => {});
it("keeps the published release when a draft replacement fails", async () => {});
it("removes an object only after PDF, cover, and installer reference counts reach zero", async () => {});
it("rejects publish when an artifact is missing or its byte size differs", async () => {});
```

Public list tests必须返回 discriminated DTO；软件零附件不公开，缺一平台返回该平台 `null`。

数据库 schema 测试增加最终态断言：修订表不再有 `pdf_object_key/cover_object_key/page_count/byte_size/sha256`；迁移测试执行 `0012`、`0013` 后验证旧列已删除、旧 PDF 附件仍完整。

- [ ] **Step 2: 运行 focused tests 并确认失败**

```bash
pnpm --filter @ai-agent-platform/database test -- src/schema/download-resources.test.ts src/migrate.integration.test.ts
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/repository.test.ts src/server/downloads/service.test.ts src/server/downloads/actions.test.ts
```

Expected: FAIL，repository 仍读取 PDF 列，数据库仍处于保留旧列的扩展态。

- [ ] **Step 3: 修改 repository 查询和事务接口**

所有 admin/public 查询加载附件行。新增事务方法：插入/克隆/替换/移除指定 slot，按对象键统计所有 artifact 与 cover 引用。资源创建的内部命令必须显式接收 kind，现有 document-only action 明确传 `document`，后续保存不得改变 kind。

本任务让 repository/service/actions 使用 Task 2 的 typed internal schemas，但保留现有 document-only admin/public DTO facade、`removeDownloadDraftFileAction`、`getAdminDraftArtifact`、`getPublicArtifact`，由附件行投影出当前 UI/route 所需形状。Task 7 删除 artifact wrappers，Task 8 删除旧 admin DTO/action，Task 9 删除旧 public DTO；这些过渡导出不进入最终部署态。

- [ ] **Step 4: 修改 service 状态机**

拆出清晰谓词：

```ts
async function publishable(revision: Revision) {
  return revision.resourceKind === "document"
    ? completeDocument(revision.artifacts) && await filesIntact(revision.artifacts)
    : completeSoftwareMetadata(revision) &&
        hasInstaller(revision.artifacts) &&
        await filesIntact(revision.artifacts);
}
```

`filesIntact` 对每个主附件调用带数据库 `byteSize` 的 `inspect`，对 document cover 调用不带大小的 `inspect`；任何对象缺失、非常规文件或主文件大小不符均阻止发布。上传顺序固定为 final object atomic move → database transaction → failure compensation。新增 `attachUploadedArtifact(slot)` 与 `removeDraftArtifact(slot)`；现有 `attachUploadedPdf` 在本任务内改为使用相同 artifact 生命周期，供尚未切换的旧路由直接调用，Task 7 随旧路由一起删除。公开 PDF filename 继续由 `revision.name` 生成；软件使用附件原文件名。

- [ ] **Step 5: 更新 actions/server-actions 并收缩数据库**

typed 表单保存按 kind 解析；创建资源必须选择 kind；现有 document action 显式补 `kind: "document"`。保留现有 UI facade 的同时，错误映射加入 `invalid_file/file_too_large/insufficient_storage`，不泄漏内部异常。

创建 `0013_remove_download_pdf_columns.sql` 删除旧 PDF 完整性约束、五个 PDF 专用列以及两个 kind 列的临时默认值；同步从 Drizzle schema 删除这些列和默认值，生成 `meta/0013_snapshot.json` 并更新 journal。迁移集成测试必须先执行 `0012` 的旧 PDF 回填，再执行 `0013`，证明附件数据保留、旧列不存在、显式 kind 成为必填。`0012` 与 `0013` 在部署时连续执行，中间状态不接受流量。

- [ ] **Step 6: 运行单元与 PostgreSQL 集成测试**

```bash
pnpm --filter @ai-agent-platform/database test -- src/schema/download-resources.test.ts
RUN_DOWNLOAD_RESOURCE_DB_TEST=true TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/database test -- src/migrate.integration.test.ts
pnpm --filter @ai-agent-platform/database typecheck
pnpm --filter @ai-agent-platform/database exec drizzle-kit check
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/contracts.test.ts src/server/downloads/repository.test.ts src/server/downloads/service.test.ts src/server/downloads/actions.test.ts
RUN_DOWNLOAD_RESOURCE_DB_TEST=true TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/web test -- src/server/downloads/repository.postgres.integration.test.ts
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS；缺少数据库 URL 时明确记录未验证。

- [ ] **Step 7: 提交生命周期改造**

```bash
git add packages/database/src/schema/download-resources.ts packages/database/src/schema/download-resources.test.ts packages/database/drizzle/0013_remove_download_pdf_columns.sql packages/database/drizzle/meta/0013_snapshot.json packages/database/drizzle/meta/_journal.json packages/database/src/migrate.integration.test.ts apps/web/src/server/downloads/contracts.ts apps/web/src/server/downloads/contracts.test.ts apps/web/src/server/downloads/repository.ts apps/web/src/server/downloads/repository.test.ts apps/web/src/server/downloads/repository.postgres.integration.test.ts apps/web/src/server/downloads/service.ts apps/web/src/server/downloads/service.test.ts apps/web/src/server/downloads/actions.ts apps/web/src/server/downloads/actions.test.ts apps/web/src/server/downloads/server-actions.ts
git commit -m "feat(downloads): publish document and software artifacts"
```

### Task 7: 增加带槽位的管理上传与公开下载路由

**Files:**
- Delete: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/upload/route.ts`
- Delete: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/upload/route.test.ts`
- Create: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/upload/[slot]/route.ts`
- Create: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/upload/[slot]/route.test.ts`
- Delete: `apps/web/src/server/downloads/pdf-upload.ts`
- Delete: `apps/web/src/server/downloads/pdf-upload.test.ts`
- Delete: `apps/web/src/server/downloads/pdf-response.ts`
- Delete: `apps/web/src/server/downloads/pdf-response.test.ts`
- Modify: `apps/web/src/server/downloads/service.ts`
- Modify: `apps/web/src/server/downloads/service.test.ts`
- Modify: `apps/web/src/server/downloads/pdf-tools.ts`
- Modify: `apps/web/src/server/downloads/pdf-tools.test.ts`
- Modify: `apps/web/src/components/admin/download-resource-manager.tsx`
- Modify: `apps/web/src/components/admin/download-resource-manager.test.tsx`
- Modify: `apps/web/src/app/api/v1/downloads/[resourceKey]/download/route.ts`
- Modify: `apps/web/src/app/api/v1/downloads/[resourceKey]/download/route.test.ts`
- Create: `apps/web/src/app/api/v1/downloads/[resourceKey]/download/[slot]/route.ts`
- Create: `apps/web/src/app/api/v1/downloads/[resourceKey]/download/[slot]/route.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/draft/cover/route.ts`
- Modify: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/draft/cover/route.test.ts`
- Modify: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/draft/pdf/route.ts`
- Modify: `apps/web/src/app/api/v1/admin/downloads/[resourceId]/draft/pdf/route.test.ts`
- Modify: `apps/web/src/app/api/v1/downloads/[resourceKey]/cover/route.ts`
- Modify: `apps/web/src/app/api/v1/downloads/[resourceKey]/cover/route.test.ts`
- Modify: `apps/web/src/app/api/v1/downloads/[resourceKey]/preview/route.ts`
- Modify: `apps/web/src/app/api/v1/downloads/[resourceKey]/preview/route.test.ts`

- [ ] **Step 1: 写 route 失败测试**

管理上传覆盖合法 slot、非法 slot、wrong method、trusted mutation、权限、If-Match、取消清理，并精确断言错误合同：非法 multipart=`400 invalid_multipart`、特征/扩展名/槽位不符=`422 invalid_file`、超限=`413 file_too_large`、parser/createStage/commit/PDF derive 任一处 ENOSPC=`507 insufficient_storage`。`pdf-tools.test.ts` 用真实 `code='ENOSPC'` 错误验证派生层保留 cause/code，而非只在 route mock。公开软件下载覆盖 Windows/macOS、缺失 slot 404、未发布 404、磁盘对象缺失 404、实际大小不符 404、HEAD、Range、文件名和固定 MIME。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/pdf-tools.test.ts src/app/api/v1/admin/downloads/'[resourceId]'/upload/'[slot]'/route.test.ts src/app/api/v1/downloads/'[resourceKey]'/download/'[slot]'/route.test.ts
```

Expected: FAIL，新路由不存在。

- [ ] **Step 3: 实现新路由并删除旧上传路由**

管理路由把 path slot 显式传给通用 parser/service。PDF 上传使用 `document` slot 并继续调用 `pdfTools.derive`；安装包不进入 PDF tools。`pdf-tools` 遇到 `ENOSPC` 时保留可识别 cause/code，其余处理失败仍归一为不外泄的 `processing_failed`。同步把现有 manager 的 document 上传 URL 改为 `/upload/document`，form field 改为 `artifact`，用原测试锁定，避免删除旧 route 后 UI 失效。公开 PDF 原路径保持不变，软件使用 `/download/windows|macos`；公开主文件响应前调用 `inspect(objectKey, byteSize)`，cover 调用不带大小的 `inspect`，失败统一 404。全部调用切换后删除 `pdf-upload`、`pdf-response`、file store 旧 `commit` API 及测试，并从 service 删除 `attachUploadedPdf/getAdminDraftArtifact/getPublicArtifact`；`createStage` 作为唯一通用暂存 API 保留，不保留转发导出或兼容别名。

- [ ] **Step 4: 更新所有 artifact response import 并跑 route 集合**

```bash
pnpm --filter @ai-agent-platform/web test -- src/server/downloads/pdf-tools.test.ts src/app/api/v1/admin/downloads src/app/api/v1/downloads
pnpm --filter @ai-agent-platform/web test -- src/components/admin/download-resource-manager.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS；源码不再引用 `pdf-upload` 或 `pdf-response`。

- [ ] **Step 5: 提交 HTTP 切换**

```bash
git add apps/web/src/app/api/v1/admin/downloads apps/web/src/app/api/v1/downloads apps/web/src/components/admin/download-resource-manager.tsx apps/web/src/components/admin/download-resource-manager.test.tsx apps/web/src/server/downloads/file-store.ts apps/web/src/server/downloads/file-store.test.ts apps/web/src/server/downloads/artifact-upload.ts apps/web/src/server/downloads/artifact-upload.test.ts apps/web/src/server/downloads/artifact-response.ts apps/web/src/server/downloads/artifact-response.test.ts apps/web/src/server/downloads/pdf-upload.ts apps/web/src/server/downloads/pdf-upload.test.ts apps/web/src/server/downloads/pdf-response.ts apps/web/src/server/downloads/pdf-response.test.ts apps/web/src/server/downloads/pdf-tools.ts apps/web/src/server/downloads/pdf-tools.test.ts apps/web/src/server/downloads/service.ts apps/web/src/server/downloads/service.test.ts
git commit -m "feat(downloads): upload and download platform artifacts"
```

## Chunk 3: 后台下载管理

### Task 8: 为软件资源增加版本与双平台上传槽位

**Files:**
- Create: `apps/web/src/components/admin/download-software-artifacts.tsx`
- Create: `apps/web/src/components/admin/download-software-artifacts.test.tsx`
- Modify: `apps/web/src/components/admin/download-resource-manager.tsx`
- Modify: `apps/web/src/components/admin/download-resource-manager.test.tsx`
- Modify: `apps/web/src/app/admin/downloads/page.tsx`
- Modify: `apps/web/src/app/admin/downloads/page.test.tsx`
- Modify: `apps/web/src/server/downloads/contracts.ts`
- Modify: `apps/web/src/server/downloads/contracts.test.ts`
- Modify: `apps/web/src/server/downloads/service.ts`
- Modify: `apps/web/src/server/downloads/service.test.ts`
- Modify: `apps/web/src/server/downloads/actions.ts`
- Modify: `apps/web/src/server/downloads/actions.test.ts`
- Modify: `apps/web/src/server/downloads/server-actions.ts`
- Verify unchanged: `apps/web/src/components/admin/download-resource-manager.css`

- [ ] **Step 1: 写软件编辑器失败测试**

测试：统一版本号和公共元数据；Windows accept `.exe,.msi,.zip`；macOS accept `.dmg,.pkg,.zip`；独立上传/替换/移除；显示 filename/size/SHA；未上传显示“暂无资源”；任意一端完整时发布可用；上传时同时锁定资源切换和发布，取消后恢复两者；软件不出现 PDF 封面、预览和权限控件。page 测试锁定 typed admin list；合同/action 测试锁定旧 document-only admin DTO 和 `removeDownloadDraftFileAction` 已删除。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/admin/download-software-artifacts.test.tsx src/components/admin/download-resource-manager.test.tsx
pnpm --filter @ai-agent-platform/web test -- src/app/admin/downloads/page.test.tsx src/server/downloads/contracts.test.ts src/server/downloads/service.test.ts src/server/downloads/actions.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现小型软件附件组件**

`DownloadSoftwareArtifacts` 只负责两个 slot 的呈现与事件，不拥有资源列表/筛选状态：

```ts
type Props = {
  artifacts: { windows: AdminArtifact | null; macos: AdminArtifact | null };
  disabled: boolean;
  onUpload(slot: "windows" | "macos", file: File): void;
  onRemove(slot: "windows" | "macos"): void;
};
```

复用现有按钮、错误、进度样式；不重做视觉颜色和布局系统。

- [ ] **Step 4: 在 manager 中按 kind 分支**

创建资源时增加“文档/软件”选择且创建后不可编辑。文档保留当前 UI；软件显示版本号和 Task 8 组件。页面和 manager 切换到 typed admin DTO；把 Task 2 的 typed admin schema 设为正式导出，删除 Task 6 的旧 admin facade、旧 document-only DTO 与 `removeDownloadDraftFileAction`。

新增唯一替代动作 `removeDownloadDraftArtifactAction`：从 FormData 严格解析 `{ id, expectedRowVersion, slot: "document" | "windows" | "macos" }`，调用 `service.removeDraftArtifact`，沿用现有 action state 返回最新 typed admin DTO 或 row-version conflict。manager 按资源 kind 传合法 slot，并用返回 DTO 原子替换列表中的同一资源；冲突时保持当前 UI 数据并显示现有错误。公开 DTO facade 留到 Task 9。上传 fetch 改为：

```ts
fetch(`/api/v1/admin/downloads/${resource.id}/upload/${slot}`, {
  method: "POST",
  headers: { "If-Match": `"${resource.rowVersion}"` },
  body: formDataWithArtifact,
  signal,
});
```

- [ ] **Step 5: 运行 focused UI tests**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/admin/download-software-artifacts.test.tsx src/components/admin/download-resource-manager.test.tsx
pnpm --filter @ai-agent-platform/web test -- src/app/admin/downloads/page.test.tsx src/server/downloads/contracts.test.ts src/server/downloads/service.test.ts src/server/downloads/actions.test.ts
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

Expected: PASS。

- [ ] **Step 6: 提交后台 UI**

```bash
git add apps/web/src/components/admin/download-software-artifacts.tsx apps/web/src/components/admin/download-software-artifacts.test.tsx apps/web/src/components/admin/download-resource-manager.tsx apps/web/src/components/admin/download-resource-manager.test.tsx apps/web/src/app/admin/downloads/page.tsx apps/web/src/app/admin/downloads/page.test.tsx apps/web/src/server/downloads/contracts.ts apps/web/src/server/downloads/contracts.test.ts apps/web/src/server/downloads/service.ts apps/web/src/server/downloads/service.test.ts apps/web/src/server/downloads/actions.ts apps/web/src/server/downloads/actions.test.ts apps/web/src/server/downloads/server-actions.ts
git commit -m "feat(admin): manage desktop client artifacts"
```

## Chunk 4: 公开官网与内容调整

### Task 9: 恢复码里奥客户端区块并调整下载中心

**Files:**
- Modify: `apps/web/src/components/download-center-content.ts`
- Modify: `apps/web/src/components/download-center-content.test.ts`
- Modify: `apps/web/src/components/download-center.tsx`
- Modify: `apps/web/src/components/download-center.test.tsx`
- Modify: `apps/web/src/app/downloads/page.tsx`
- Modify: `apps/web/src/app/downloads/page.test.tsx`
- Modify: `apps/web/src/app/downloads/preview/[resourceKey]/page.tsx`
- Modify: `apps/web/src/app/downloads/preview/[resourceKey]/page.test.tsx`
- Modify: `apps/web/src/server/downloads/contracts.ts`
- Modify: `apps/web/src/server/downloads/contracts.test.ts`
- Modify: `apps/web/src/server/downloads/service.ts`
- Modify: `apps/web/src/server/downloads/service.test.ts`
- Verify unchanged: `apps/web/src/app/downloads/downloads.css`
- Read-only reference: `/Users/brou/Downloads/华鲲官网便携版v4/华鲲官网首期低保真原型.html`

- [ ] **Step 1: 写前台失败测试**

锁定以下合同：

```ts
expect(downloadJourney.at(-1)).toEqual({
  title: "联系我们",
  description: "联系华鲲团队获取方案与产品支持",
  href: "/contact?topic=下载与资料咨询",
});
```

下载页测试还要断言：没有 hero action 容器；CTA 含“从产品认知到联系我们申请体验”；仅 Windows、仅 macOS、双平台；缺失平台文字“暂无资源”且无链接；零附件软件 DTO 被服务层过滤；安装路径逐字等于 `下载安装包 → 安装部署 → 进入使用` 且不含“阅读部署文档”；直接下载 URL 正确。page/service/contract 测试锁定 typed public DTO 已成为唯一公开合同；preview page 明确只接受 document，software key 不进入 PDF 预览逻辑。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/download-center-content.test.ts src/components/download-center.test.tsx src/app/downloads/page.test.tsx src/app/downloads/preview/'[resourceKey]'/page.test.tsx src/server/downloads/contracts.test.ts src/server/downloads/service.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 discriminated 渲染**

文档资源继续进入现有 `ResourceCard`。参考便携版原型的 `dl-soft` 信息结构恢复 `mdd2-client` 单个区块，但使用当前仓库已有 `.download-card/.download-actions/.download-empty` 类组合，不复制原型 CSS；显示版本与两个平台状态，不恢复确认弹窗。删除 hero “了解产品/申请体验”整个容器。

- [ ] **Step 4: 切换公开合同且保持现有视觉系统**

下载 page 与组件切换到 typed public DTO，把它设为正式 `downloadResourcePublicDtoSchema`，删除 Task 6 保留的旧 public facade。preview page 先按 `kind === "document"` 收窄再读取 PDF 字段。只组合当前 `.download-card`、`.download-actions`、`.download-empty` 等既有通用 class；不得修改 CSS、颜色、排版、页面布局、导航或 Agent 样式。

- [ ] **Step 5: 运行测试并提交**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/download-center-content.test.ts src/components/download-center.test.tsx src/app/downloads/page.test.tsx src/app/downloads/preview/'[resourceKey]'/page.test.tsx src/server/downloads/contracts.test.ts src/server/downloads/service.test.ts
pnpm --filter @ai-agent-platform/web typecheck
git add apps/web/src/components/download-center-content.ts apps/web/src/components/download-center-content.test.ts apps/web/src/components/download-center.tsx apps/web/src/components/download-center.test.tsx apps/web/src/app/downloads/page.tsx apps/web/src/app/downloads/page.test.tsx apps/web/src/app/downloads/preview/'[resourceKey]'/page.tsx apps/web/src/app/downloads/preview/'[resourceKey]'/page.test.tsx apps/web/src/server/downloads/contracts.ts apps/web/src/server/downloads/contracts.test.ts apps/web/src/server/downloads/service.ts apps/web/src/server/downloads/service.test.ts
git commit -m "feat(downloads): restore desktop client downloads"
```

### Task 10: 隐藏申请体验入口并完成指定文案

**Files:**
- Create: `apps/web/src/config/public-entry-policy.ts`
- Create: `apps/web/src/config/public-entry-policy.test.ts`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.test.tsx`
- Modify: `packages/ui/src/navigation/portal-header.tsx`
- Modify: `packages/ui/src/navigation/portal-header.test.tsx`
- Modify: `packages/ui/src/navigation/mobile-navigation.tsx`
- Modify: `packages/ui/src/navigation/mobile-navigation.test.tsx`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Modify: `apps/web/src/components/home-content.ts`
- Modify: `apps/web/src/components/home-content.test.ts`
- Modify: `apps/web/src/components/home-sections.tsx`
- Create: `apps/web/src/components/home-sections.test.tsx`
- Modify: `apps/web/src/components/platform-center-v2-content.ts`
- Modify: `apps/web/src/components/platform-center-detail.tsx`
- Modify: `apps/web/src/components/platform-center-detail.test.tsx`
- Modify: `apps/web/src/components/standalone-product-center.tsx`
- Modify: `apps/web/src/components/standalone-product-center.test.tsx`
- Modify: `apps/web/src/components/standalone-product-detail.tsx`
- Modify: `apps/web/src/components/standalone-product-detail.test.tsx`
- Modify: `apps/web/src/components/product-portal-overview.tsx`
- Modify: `apps/web/src/components/product-portal-overview.test.tsx`
- Modify: `apps/web/src/components/partner-center.tsx`
- Modify: `apps/web/src/components/partner-center.test.tsx`
- Modify: `apps/web/src/app/solutions/[slug]/page.tsx`
- Modify: `apps/web/src/app/solutions/[slug]/page.test.tsx`
- Verify unchanged: `apps/web/src/components/trial-content.test.ts`
- Verify unchanged: `apps/web/src/components/trial-experience.test.tsx`

- [ ] **Step 1: 写入口策略失败测试**

```ts
expect(isPublicEntryVisible("/trial")).toBe(false);
expect(isPublicEntryVisible("/trial?source=home")).toBe(false);
expect(isPublicEntryVisible("/contact?topic=官网咨询")).toBe(true);
```

Header/mobile/footer 及上述六个共享 content renderer 测试改为找不到“申请体验”，同时 `routes.test.ts`、`trial-content.test.ts` 与 `trial-experience.test.tsx` 继续断言 `/trial` 为 live 且组件可直接渲染。保留 AppShell/SiteShell 现有 assistant entry 断言，防止入口过滤影响 Agent。策略测试还覆盖 query/hash、绝对外链不误判，以及 `filterPublicEntries` 保持输入顺序且不修改原数组。

- [ ] **Step 2: 运行 focused tests 并确认失败**

```bash
pnpm --filter @ai-agent-platform/web test -- src/config/public-entry-policy.test.ts src/components/site-shell/site-shell.test.tsx src/components/home-content.test.ts src/components/home-sections.test.tsx src/components/platform-center-detail.test.tsx src/components/standalone-product-center.test.tsx src/components/standalone-product-detail.test.tsx src/components/product-portal-overview.test.tsx src/components/partner-center.test.tsx src/app/solutions/'[slug]'/page.test.tsx
pnpm --filter @ai-agent-platform/ui test -- src/app-shell.test.tsx src/navigation/portal-header.test.tsx src/navigation/mobile-navigation.test.tsx src/navigation/site-footer.test.tsx
```

Expected: FAIL。

- [ ] **Step 3: 实现渲染期过滤，不使用 CSS**

`isPublicEntryVisible` 只判断站内 href 的 pathname 是否为 `/trial`；`filterPublicEntries` 只做浅层 action 过滤。App `SiteShell` 先按现有导航结构过滤 portal/footer 中的 `/trial` item，并把 `trialEntryVisible={false}` 传给 UI shell/header/mobile。`home-sections`、`platform-center-detail`、`standalone-product-center`、`standalone-product-detail`、`product-portal-overview`、`partner-center` 在 action `.map()` 前调用同一 helper；solution slug page 的直接链接显式调用该策略。不要删除 `/trial` route、page、public page context、内容数据或功能代码，不建立第二套路由配置。

- [ ] **Step 4: 完成精确文案与首页入口**

首页 hero actions 为：

```ts
[
  { label: "查看解决方案", href: "/solutions", variant: "primary" },
  { label: "联系我们", href: "/contact?topic=官网咨询", variant: "secondary" },
]
```

在 `platform-center-v2-content.ts` 只替换模型、智能体、行业应用、技能、权限五个 closing CTA。`platform-center-detail.test.tsx` 逐个断言这五个 closing description 含精确句子“欢迎与华鲲团队沟通并联系我们申请试用。”，且均不含旧句；同时断言 coding closing description 仍逐字为“申请体验编程中心，或与华鲲团队沟通企业级部署方案。”。不要修改编程中心，不要修改任何按钮颜色或 CSS。

- [ ] **Step 5: 运行公开入口与内容测试**

```bash
pnpm --filter @ai-agent-platform/ui test -- src/app-shell.test.tsx src/navigation/portal-header.test.tsx src/navigation/mobile-navigation.test.tsx src/navigation/site-footer.test.tsx
pnpm --filter @ai-agent-platform/web test -- src/config/public-entry-policy.test.ts src/config/routes.test.ts src/config/navigation.test.ts src/components/site-shell/site-shell.test.tsx src/components/home-content.test.ts src/components/home-sections.test.tsx src/components/platform-center-detail.test.tsx src/components/standalone-product-center.test.tsx src/components/standalone-product-detail.test.tsx src/components/product-portal-overview.test.tsx src/components/partner-center.test.tsx src/components/trial-content.test.ts src/components/trial-experience.test.tsx src/app/solutions/'[slug]'/page.test.tsx src/app/contact/page.test.tsx
rg -n 'href="/trial"|href: "/trial"' apps/web/src packages/ui/src
```

Expected: 测试 PASS；`rg` 只允许路由注册、trial 页面/数据、协议上下文或被统一过滤的内容数据，不允许任何未经策略处理的公开渲染入口。

- [ ] **Step 6: 提交入口与文案**

```bash
git add apps/web/src/config/public-entry-policy.ts apps/web/src/config/public-entry-policy.test.ts apps/web/src/components/site-shell/site-shell.tsx apps/web/src/components/site-shell/site-shell.test.tsx packages/ui/src/app-shell.tsx packages/ui/src/app-shell.test.tsx packages/ui/src/navigation/portal-header.tsx packages/ui/src/navigation/portal-header.test.tsx packages/ui/src/navigation/mobile-navigation.tsx packages/ui/src/navigation/mobile-navigation.test.tsx apps/web/src/config/navigation.ts apps/web/src/config/navigation.test.ts apps/web/src/components/home-content.ts apps/web/src/components/home-content.test.ts apps/web/src/components/home-sections.tsx apps/web/src/components/home-sections.test.tsx apps/web/src/components/platform-center-v2-content.ts apps/web/src/components/platform-center-detail.tsx apps/web/src/components/platform-center-detail.test.tsx apps/web/src/components/standalone-product-center.tsx apps/web/src/components/standalone-product-center.test.tsx apps/web/src/components/standalone-product-detail.tsx apps/web/src/components/standalone-product-detail.test.tsx apps/web/src/components/product-portal-overview.tsx apps/web/src/components/product-portal-overview.test.tsx apps/web/src/components/partner-center.tsx apps/web/src/components/partner-center.test.tsx apps/web/src/app/solutions/'[slug]'/page.tsx apps/web/src/app/solutions/'[slug]'/page.test.tsx
git commit -m "feat(portal): hide trial entry points for 1.0"
```

## Chunk 5: 代理、部署与端到端验收

### Task 11: 放开受控大文件上传并更新运维合同

**Files:**
- Modify: `infra/nginx/default.conf.template`
- Verify unchanged: `infra/nginx/nginx.conf` (global 10 MiB)
- Modify: `infra/nginx/README.md`
- Modify: `infra/docker/README.md`
- Modify: `docs/deployment/server-readiness.md`
- Modify: `docs/testing/run-ci-gate.sh`
- Modify: `docs/testing/run-agentos-backup-restore.sh`
- Modify: `docs/testing/run-restore-docker-lifecycle.sh`

- [ ] **Step 1: 写代理合同失败断言**

在 `run-ci-gate.sh` 的静态 Nginx 检查中要求新带 slot 路由、`client_max_body_size 1025m`、关闭 request/response buffering 和三个一小时 timeout；同时确认全局仍为 10m。同步更新 `run_nginx_check` 运行探针：document/windows/macos 三条 POST 路径均允许大请求进入 upstream；旧 `/upload`、非法 slot 与非法 UUID 仍受全局 10m 拒绝；slot 路径 PUT 仍为 403。

- [ ] **Step 2: 运行 fast gate 并确认失败**

```bash
pnpm ci:fast
```

Expected: FAIL，Nginx 仍只匹配旧 `/upload` 且限制 201m。

- [ ] **Step 3: 修改精确 location**

只在 `/api/v1/admin/downloads/{uuid}/upload/(document|windows|macos)` 上设置 `client_max_body_size 1025m`、`proxy_request_buffering off`、`proxy_buffering off`、`client_body_timeout 3600s`、`proxy_send_timeout 3600s`、`proxy_read_timeout 3600s`；其他路由继续使用全局 10m。保持 `limit_except POST` 与代理可信头。

- [ ] **Step 4: 更新备份/恢复 fixture**

fixture 同时包含 PDF、WebP、Windows、macOS 对象键；恢复后核对数据库附件行和文件 SHA-256。staging 与无引用对象继续不进入备份。

- [ ] **Step 5: 写停机迁移 runbook**

明确顺序：从入口摘流 → 停止全部旧 Nginx/Web 进程 → 确认无旧连接/进程 → 同时备份数据库与 `download_data` → 运行迁移和核验 → 部署新 Web/Nginx → 健康检查/上传探针 → 恢复流量。迁移或核验失败时必须回滚当前事务、保持流量和全部旧/新 Web 停止、禁止启动新 Web；只能修复后重试，或按同一时点数据库+文件卷备份执行经批准的整组恢复。记录 1 GiB 上传需要的卷容量余量和 `507` 处理。

- [ ] **Step 6: 运行基础设施检查并提交**

```bash
pnpm ci:fast
sh docs/testing/run-ci-gate.sh nginx
bash docs/testing/run-agentos-backup-restore.sh
pnpm restore:lifecycle:test
```

Expected: 全部 PASS；backup/restore 命令缺少其既有隔离测试环境变量时明确记为未验证，不能只凭脚本静态检查提交。

```bash
git add infra/nginx/default.conf.template infra/nginx/README.md infra/docker/README.md docs/deployment/server-readiness.md docs/testing/run-ci-gate.sh docs/testing/run-agentos-backup-restore.sh docs/testing/run-restore-docker-lifecycle.sh
git commit -m "ops(downloads): support streamed installer uploads"
```

提交前用 `git diff --cached --name-only` 确认只有上述精确文件，不得使用宽泛 `git add docs`。

### Task 12: 浏览器与全量回归验收

**Files:**
- Modify: `packages/database/package.json`
- Create: `packages/database/src/prepare-download-resource-e2e.ts`
- Create: `packages/database/src/prepare-download-resource-e2e.test.ts`
- Create: `apps/web/e2e/admin-download-resources.spec.ts`
- Modify: `apps/web/e2e/business-entry-pages.spec.ts`
- Modify: `apps/web/e2e/full-public-site-overlay.spec.ts`

- [ ] **Step 1: 更新陈旧下载确认 E2E**

先写 `prepare-download-resource-e2e.test.ts`，证明生产/远程/错误库名被拒绝，并在实现前运行：

```bash
pnpm --filter @ai-agent-platform/database test -- src/prepare-download-resource-e2e.test.ts
```

Expected: FAIL，因为 preparation module 尚不存在。

然后新增 `db:prepare-download-e2e`：复用现有 `assertSafeIdentityMigrationTestDatabaseUrl`，只允许 loopback 主机且数据库名匹配 `ai_agent_platform_identity_test*`。通过 guard 后才清空该一次性测试库的 `public/drizzle` schema、重新运行全部迁移；浏览器测试前再依次执行现有 access seed 与 auth E2E seed。不要把 reset 逻辑放进浏览器测试。

新增一个最小后台闭环：用 `auth-fixtures.ts` 的 `addSignedSession` 和 `adminSessionToken`（不是无权限 staff）打开 `/admin/downloads`，从迁移后的初始 `mdd2-client` 开始，填统一版本，用 `setInputFiles` 内存 Buffer 生成以 `MZ` 开头的小型合法 EXE（不新增二进制 fixture），上传并发布；再到该隔离环境的公开下载中心验证 Windows 可直接下载、macOS 显示“暂无资源”，用下载事件或 HTTP 响应验证文件名和内容，不执行安装包。组件/服务测试继续覆盖仅 macOS 与双平台。标准公开 E2E 只断言默认零附件时客户端区块不显示，并删除旧“确认下载安装包”弹窗合同。

- [ ] **Step 2: 增加全站入口合同**

遍历公开 route family，断言没有可见/可访问的“申请体验”链接；直接访问 `/trial` 仍正常；首页“联系我们”主题正确；Agent launcher、面板和 `/assistant` 行为不变。

- [ ] **Step 3: 运行 focused E2E**

先用 guarded command 重建明确的一次性 `TEST_DATABASE_URL`，再依次运行 access seed、auth seed，并给下载文件使用新临时目录；该 mutation spec 只跑 desktop 单 worker。其他两个只读 spec 必须另行指向仓库已准备完整 PDF/WebP 文件卷的标准 `BASE_URL`，不得复用临时数据库或临时根：

```bash
download_e2e_root=$(mktemp -d)
trap 'rm -rf "$download_e2e_root"' EXIT
pnpm --filter @ai-agent-platform/database test -- src/prepare-download-resource-e2e.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/database db:prepare-download-e2e
DATABASE_URL="$TEST_DATABASE_URL" NODE_ENV=test pnpm --filter @ai-agent-platform/database db:seed-access
DATABASE_URL="$TEST_DATABASE_URL" NODE_ENV=test pnpm --filter @ai-agent-platform/database db:seed-auth-e2e
DATABASE_URL="$TEST_DATABASE_URL" DOWNLOAD_RESOURCE_ROOT="$download_e2e_root" pnpm --filter @ai-agent-platform/web exec playwright test e2e/admin-download-resources.spec.ts --project=desktop --workers=1
test -n "$BASE_URL"
BASE_URL="$BASE_URL" pnpm --filter @ai-agent-platform/web exec playwright test e2e/business-entry-pages.spec.ts e2e/full-public-site-overlay.spec.ts
```

Expected: guard 先机械拒绝非隔离 URL，mutation spec PASS once on desktop；public specs 对标准环境 PASS at configured desktop/mobile projects。命令结束后 trap 删除本次 `download_e2e_root`，不得指向共享或生产目录。若没有完整标准 `BASE_URL`，公开浏览器回归记为未验证，不得改用空临时根后声称通过。

- [ ] **Step 4: 运行完整验证矩阵**

```bash
RUN_DOWNLOAD_RESOURCE_DB_TEST=true TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/database test
RUN_DOWNLOAD_RESOURCE_DB_TEST=true TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/web test
pnpm --filter @ai-agent-platform/ui test
pnpm --filter @ai-agent-platform/database typecheck
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/database lint
pnpm --filter @ai-agent-platform/web lint
pnpm format:check
pnpm build
pnpm ci:full
```

Expected: 全部 PASS。数据库依赖测试必须使用安全 `TEST_DATABASE_URL` 实际运行；若环境缺失，最终状态必须写“未验证”，不能写通过。

- [ ] **Step 5: 做真实浏览器验收**

使用 `@playwright` 或浏览器控制工具检查 `/`、五个中心、`/downloads`、`/contact?topic=官网咨询`、`/trial`、`/assistant`：

- Header/mobile/footer 无申请体验入口。
- 首页联系我们右侧位置和主题正确，视觉样式未被重做。
- 下载中心无 hero 空按钮区，第四步与 CTA 文案正确。
- 客户端区块的可用/缺失平台状态和下载行为正确。
- PDF 预览、PDF 下载、联系获取没有回归。
- Agent/聊天保持原样。

- [ ] **Step 6: 提交 E2E 验收**

```bash
git add packages/database/package.json packages/database/src/prepare-download-resource-e2e.ts packages/database/src/prepare-download-resource-e2e.test.ts apps/web/e2e/admin-download-resources.spec.ts apps/web/e2e/business-entry-pages.spec.ts apps/web/e2e/full-public-site-overlay.spec.ts
git commit -m "test(downloads): verify installer publishing end to end"
```

- [ ] **Step 7: 检查提交范围并请求代码审查**

```bash
git status --short
git log --oneline --decorate a1dc3edf..HEAD
git diff --check a1dc3edf..HEAD
git diff --stat a1dc3edf..HEAD
git diff --name-only a1dc3edf..HEAD | rg '\.css$|(^|/)assistant([/-]|$)'
```

Expected: 前四项证明只包含本计划明确列出的任务文件，没有主工作区的无关改动且 worktree 干净；最后一个 `rg` 无输出（exit 1），证明没有 CSS 或 Agent/chat implementation 文件变化。此时 E2E 提交已包含在 `a1dc3edf..HEAD`。使用 `@superpowers:requesting-code-review` 做最终代码审查，修复阻断问题后重复 focused/full 验证。

完成前必须调用 `@superpowers:verification-before-completion`，以当前 worktree 的新鲜命令输出为准，不引用旧运行记录。
