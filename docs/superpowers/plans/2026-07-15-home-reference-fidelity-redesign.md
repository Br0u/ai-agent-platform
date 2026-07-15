# Home Reference-Fidelity Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the homepage as five responsive, accessible, high-fidelity sections matching the approved references while leaving the existing navbar untouched and retaining the current private-deployment close and footer.

**Architecture:** Keep the homepage server-rendered and data-driven. All redesigned static copy, repeated collection data, redesigned CTA route targets, and icon identifiers live in `home-content.ts`; semantic section components only render that data with local static imagery; a small `HomeIcon` adapter maps identifiers to existing Lucide icons; one homepage stylesheet owns the visual system, responsive rules, motion, and fallbacks. The retained private-deployment close remains unchanged. Generated 3D illustrations are local assets with no runtime network dependency.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript 5.9, Lucide React, CSS, Vitest + Testing Library, Playwright, image generation, `cwebp`.

**Approved spec:** `docs/superpowers/specs/2026-07-15-home-reference-fidelity-redesign.md`

**Execution branch:** `codex/assistant-resizable-dock` (confirmed by the user). The working tree already contains unrelated changes. Never run `git add -A`; stage only the exact files named by each task. Do not edit anything under `packages/ui/src/navigation/`, and do not alter navbar markup or styles.

---

## File map

| File | Responsibility |
|---|---|
| `docs/design/references/home-reference/reference-01-hero.webp` | Durable 1400px Hero comparison reference |
| `docs/design/references/home-reference/reference-02-platform.webp` | Durable 1400px platform comparison reference |
| `docs/design/references/home-reference/reference-03-enterprise.webp` | Durable 1400px enterprise comparison reference |
| `docs/design/references/home-reference/reference-04-solutions.webp` | Durable 1400px solutions comparison reference |
| `docs/design/references/home-reference/reference-05-resources.webp` | Durable 1400px resources comparison reference |
| `apps/web/src/assets/home/source/platform-loop.png` | Generated high-resolution transparent source for the platform-loop illustration |
| `apps/web/src/assets/home/source/solutions-platform.png` | Generated high-resolution transparent source for the industry-solutions illustration |
| `apps/web/src/assets/home/source/resources-folder.png` | Generated high-resolution transparent source for the resources illustration |
| `apps/web/src/assets/home/platform-loop.webp` | Optimized runtime platform-loop asset |
| `apps/web/src/assets/home/solutions-platform.webp` | Optimized runtime industry-solutions asset |
| `apps/web/src/assets/home/resources-folder.webp` | Optimized runtime resources asset |
| `apps/web/src/assets/home/README.md` | Asset prompts, provenance, optimization commands, and usage rules |
| `apps/web/src/components/home-content.ts` | All approved fixed copy, repeated card/row copy, codes, hrefs, and icon identifiers |
| `apps/web/src/components/home-content.test.ts` | Locks reference copy, ordering, and existing route targets |
| `apps/web/src/components/home-icon.tsx` | Maps the small `HomeIconName` union to Lucide icons |
| `apps/web/src/components/home-sections.tsx` | Semantic server-rendered markup for the five reference regions and retained close |
| `apps/web/src/components/home.css` | Homepage-only visual system, layouts, responsive behavior, motion, and fallbacks |
| `apps/web/src/app/page.tsx` | Composes the atmosphere layer and approved region order |
| `apps/web/src/app/page.test.tsx` | Verifies region order, key content, links, accessible imagery, and structural hooks |
| `apps/web/e2e/home-reference-layout.spec.ts` | Verifies desktop/mobile composition, overflow, target sizes, and reduced motion |

## Existing-change protection

- `apps/web/src/app/page.test.tsx` is already modified. Preserve its valid homepage intent, but replace the now-invalid assertions that require a glass Hero copy panel and dark enterprise panels. Those conflict with the approved references.
- `apps/web/src/components/home-sections.tsx`, `home-content.ts`, and `home.css` are currently clean and may be rewritten for this feature.
- `.superpowers/` is local brainstorming output and must not be staged.
- The five approved references have already been preserved under `docs/design/references/home-reference/`; implementation and QA must use those paths instead of temporary clipboard files.
- Before implementation begins, the plan-publication commit must include this plan and every file under `docs/design/references/home-reference/`, making the references available in any checkout.
- Before the first edit, save `git diff -- apps/web/src/app/page.test.tsx` to the terminal log. Before every commit, run `git diff --cached --name-only` and confirm only task files are staged.
- Before the first edit, run the whole web lint and format checks once and save their complete output plus exit codes as `/tmp/home-redesign-lint-baseline.log` and `/tmp/home-redesign-format-baseline.log`. A final whole-app failure is acceptable only when it is identical to a recorded pre-existing failure and no touched homepage file appears in it; targeted checks for every touched file must still pass.

Capture the baselines with:

```bash
sh -c 'pnpm --filter @ai-agent-platform/web lint; printf "exit=%s\n" "$?"' > /tmp/home-redesign-lint-baseline.log 2>&1
sh -c 'pnpm --filter @ai-agent-platform/web format:check; printf "exit=%s\n" "$?"' > /tmp/home-redesign-format-baseline.log 2>&1
```

---

## Chunk 1: Assets, content contracts, and semantic structure

### Task 1: Produce and verify the three local 3D illustrations

**Files:**
- Create: `apps/web/src/assets/home/source/platform-loop.png`
- Create: `apps/web/src/assets/home/source/solutions-platform.png`
- Create: `apps/web/src/assets/home/source/resources-folder.png`
- Create: `apps/web/src/assets/home/platform-loop.webp`
- Create: `apps/web/src/assets/home/solutions-platform.webp`
- Create: `apps/web/src/assets/home/resources-folder.webp`
- Create: `apps/web/src/assets/home/README.md`

- [ ] **Step 1: Generate the platform-loop source with `@imagegen`**

Use this exact prompt:

```text
Use case: stylized-concept. Asset type: enterprise website section illustration. Create a sculptural loop made from two interlocking translucent glass ribbons, viewed from a slightly elevated front-right three-quarter angle. Frosted crystal material, soft cobalt blue and restrained violet gradients, subtle cyan rim light, luminous inner edge, elegant rounded geometry. Center the subject with generous padding in a 4:3 composition. Place it on a perfectly flat solid #00ff00 chroma-key background for local background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep crisp separated edges and do not use #00ff00 anywhere in the subject. No pedestal, text, logo, letters, UI, border, cast shadow, contact shadow, reflection, or watermark.
```

Copy the built-in output from `$CODEX_HOME/generated_images/` to `tmp/imagegen/home/platform-loop-chroma.png`, then run:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" --input tmp/imagegen/home/platform-loop-chroma.png --out apps/web/src/assets/home/source/platform-loop.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

- [ ] **Step 2: Generate the solutions-platform source with `@imagegen`**

Use this exact prompt:

```text
Use case: stylized-concept. Asset type: enterprise website section illustration. Create a low rounded translucent glass platform in cobalt blue and restrained violet, with three floating glass interface tiles showing only simple abstract symbols: analytics bars, a magnifying glass, and a pie chart. Add only a few tiny translucent cubes and connecting light arcs. Use high-key soft lighting, frosted crystal material, and subtle cyan highlights. Center the subject with generous padding in a 4:3 composition. Place it on a perfectly flat solid #00ff00 chroma-key background for local background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep crisp separated edges and do not use #00ff00 anywhere in the subject. No words, numbers, logo, brand, full UI screenshot, border, cast shadow, contact shadow, reflection, or watermark.
```

Copy the built-in output to `tmp/imagegen/home/solutions-platform-chroma.png`, then run the same installed background-removal helper with that input and `apps/web/src/assets/home/source/solutions-platform.png` as the output.

- [ ] **Step 3: Generate the resources-folder source with `@imagegen`**

Use this exact prompt:

```text
Use case: stylized-concept. Asset type: enterprise website section illustration. Create a translucent cobalt-blue glass document folder on a low rounded glass base, several white-blue document sheets emerging from the folder, and a small magnifying glass leaning against the right side. Use restrained violet gradient accents, soft cyan rim light, frosted crystal material, and clean high-key lighting. Center the subject with generous padding in a 4:3 composition. Place it on a perfectly flat solid #00ff00 chroma-key background for local background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep crisp separated edges and do not use #00ff00 anywhere in the subject. No words, letters, logo, brand, border, cast shadow, contact shadow, reflection, or watermark.
```

Copy the built-in output to `tmp/imagegen/home/resources-folder-chroma.png`, then run the same installed background-removal helper with that input and `apps/web/src/assets/home/source/resources-folder.png` as the output.

- [ ] **Step 4: Inspect all three source images**

Open each source with the local image viewer at original detail. Reject and regenerate an image if it contains text, a logo, a non-transparent background, cropped geometry, muddy dark shadows, or a style that does not match the other two.

Then run this metadata gate for each stem:

```bash
for stem in platform-loop solutions-platform resources-folder; do
  metadata="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt -of csv=p=0:s=x "apps/web/src/assets/home/source/${stem}.png")"
  IFS=x read -r width height pix_fmt <<< "$metadata"
  test "$width" -ge 1024
  test "$height" -ge 768
  case "$pix_fmt" in *a*) ;; *) echo "${stem}: missing alpha channel" >&2; exit 1 ;; esac
done
```

Expected: exit 0; every source is at least 1024×768 and reports an alpha-bearing pixel format such as `rgba`.

- [ ] **Step 5: Create optimized WebP assets**

Run:

```bash
cwebp -q 88 -m 6 -alpha_q 95 apps/web/src/assets/home/source/platform-loop.png -o apps/web/src/assets/home/platform-loop.webp
cwebp -q 88 -m 6 -alpha_q 95 apps/web/src/assets/home/source/solutions-platform.png -o apps/web/src/assets/home/solutions-platform.webp
cwebp -q 88 -m 6 -alpha_q 95 apps/web/src/assets/home/source/resources-folder.png -o apps/web/src/assets/home/resources-folder.webp
```

Expected: all commands exit 0; each WebP has an alpha channel and is materially smaller than its PNG source.

Verify that expectation mechanically:

```bash
for stem in platform-loop solutions-platform resources-folder; do
  metadata="$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "apps/web/src/assets/home/${stem}.webp")"
  case "$metadata" in *a*) ;; *) echo "${stem}: WebP lost alpha" >&2; exit 1 ;; esac
  test "$(stat -f%z "apps/web/src/assets/home/${stem}.webp")" -lt "$(stat -f%z "apps/web/src/assets/home/source/${stem}.png")"
done
```

Expected: exit 0; every runtime file preserves alpha and is smaller than its source.

- [ ] **Step 6: Record provenance and usage rules**

Create `apps/web/src/assets/home/README.md` with:

```markdown
# Homepage generated illustrations

Generated on 2026-07-15 from user-approved prompts for the homepage reference-fidelity redesign.

- `platform-loop.webp`: decorative platform-flow illustration.
- `solutions-platform.webp`: decorative industry-solutions illustration.
- `resources-folder.webp`: decorative resources illustration.
- `source/*.png`: transparent high-resolution generation outputs.

Runtime components use the WebP files through Next static imports. The images are decorative and must render with `alt=""` and `aria-hidden="true"`. Do not use these files as product screenshots or brand marks.

Optimization:

`cwebp -q 88 -m 6 -alpha_q 95 source.png -o output.webp`
```

- [ ] **Step 7: Commit only the generated assets**

```bash
git add apps/web/src/assets/home
git diff --cached --name-only
git commit -m "feat(home): add reference-matched illustrations"
```

Expected staged paths: only `apps/web/src/assets/home/**`.

### Task 2: Lock the approved homepage copy and routes

**Files:**
- Create: `apps/web/src/components/home-content.test.ts`
- Modify: `apps/web/src/components/home-content.ts`

- [ ] **Step 1: Write the failing content contract test**

Create `home-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  capabilities,
  enterpriseProofs,
  homeCopy,
  platformLayers,
  resources,
  solutions,
} from "./home-content";

describe("homepage reference content", () => {
  it("keeps every fixed section label and introduction in the data contract", () => {
    expect(homeCopy).toEqual({
      hero: {
        technicalLine: "国产算力 · 私有化部署 · 企业级 AI 开发",
        heading: { before: "让企业 ", emphasis: "AI", after: " 从模型走向业务" },
        productName: "华鲲元启 AI开发赋能平台",
        productCode: "TGDataXAI",
        summary: "以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系，让智能体开发像搭积木一样简单。",
        primaryCta: { label: "了解平台", href: "/product" },
        secondaryCta: { label: "阅读文档", href: "/docs" },
        evidenceLabel: "PLATFORM / UI-01",
        evidenceProduct: "TGDataXAI",
        evidenceCaption: "应用广场界面 · 用户提供的华鲲元启平台截图",
      },
      platform: {
        kicker: "PLATFORM / 01",
        heading: { before: "一套平台，贯通企业 ", emphasis: "AI", after: " 开发全流程" },
        intro: "从企业数据进入知识工程，到智能体发布与模型运行，能力被组织为可理解、可管理的开发路径。",
        primaryCta: { label: "了解平台", href: "/product" },
        secondaryCta: { label: "阅读文档", href: "/docs" },
      },
      enterprise: {
        kicker: "ENTERPRISE / 02",
        heading: "为企业边界而设计",
      },
      solutions: {
        kicker: "SOLUTIONS / 03",
        heading: { before: "从平台能力，走向", emphasis: "行业场景", after: "" },
        intro: "行业方案建立在统一平台之上。视觉检索是其中的多模态子能力，不是独立上位平台。",
      },
      resources: {
        kicker: "RESOURCES / 01",
        heading: { before: "下一步，从这里", emphasis: "开始", after: "" },
        intro: "为您准备了关键的资源与文档，助力快速上手平台，开启高效开发之旅。",
      },
    });
  });

  it("keeps the approved capability chain and icon mapping", () => {
    expect(capabilities).toEqual([
      { code: "01", title: "私有化部署", description: "安全合规 · 数据可控", icon: "shield" },
      { code: "02", title: "异构算力调度", description: "多源算力 · 高效调度", icon: "box" },
      { code: "03", title: "低代码智能体开发", description: "可视编排 · 快速构建", icon: "code" },
      { code: "04", title: "模型全生命周期管理", description: "从训练到治理 · 全链路管理", icon: "activity" },
    ]);
  });

  it("keeps the approved platform copy and icon mapping", () => {
    expect(platformLayers).toEqual([
      { code: "L1", title: "数据与知识", description: "知识库、多模态文档、知识图谱、数据源接入与数据预览。", icon: "database" },
      { code: "L2", title: "开发与编排", description: "流程编排、Prompt、MCP 接入与智能体应用发布。", icon: "code" },
      { code: "L3", title: "模型与运行", description: "模型仓库、训练中心、推理中心、评估中心与多种部署方式。", icon: "layers" },
      { code: "L4", title: "企业底座", description: "权限管理、用户管理、数据权限与算力分配。", icon: "shield" },
    ]);
  });

  it("keeps the approved enterprise copy and icon mapping", () => {
    expect(enterpriseProofs).toEqual([
      { title: "数据留在企业边界内", description: "围绕私有化部署与数据本地化要求组织模型、知识与应用能力。", icon: "database" },
      { title: "非结构化数据进入知识工程", description: "支持文档上传、自动分片、语料处理和知识图谱，让企业资料成为可用知识。", icon: "file" },
      { title: "低代码缩短落地路径", description: "通过可视化流程编排和预置智能体，把模型能力连接到具体业务过程。", icon: "code" },
      { title: "权限、数据和算力统一管控", description: "将用户、操作、数据权限与异构资源管理纳入同一企业级控制边界。", icon: "shield" },
    ]);
  });

  it("keeps the approved solution copy, icon mapping, and S5 subset label", () => {
    expect(solutions).toEqual([
      { title: "知识问答与知识加工", description: "企业资料进入知识库后，用于检索、问答与内容加工。", subsetLabel: undefined, icon: "message" },
      { title: "数据问答与报告生成", description: "连接结构化数据，形成面向业务人员的数据理解入口。", subsetLabel: undefined, icon: "file" },
      { title: "知识图谱", description: "构建实体与关系网络，支撑更明确的知识连接。", subsetLabel: undefined, icon: "network" },
      { title: "图像与多模态处理", description: "承载图像、语音和视频等多模态模型接入与业务处理。", subsetLabel: undefined, icon: "image" },
      { title: "视觉检索解决方案", description: "即时检索、持续布控、自然语言配置与预警管理。", subsetLabel: "基于华鲲元启的行业子能力", icon: "eye" },
    ]);
  });

  it("uses exact resource copy without changing the existing route targets", () => {
    expect(resources).toEqual([
      { title: "产品文档", description: "了解产品功能、使用方法和规范。", href: "/docs", icon: "file" },
      { title: "版本更新", description: "查看最新版本说明与迭代优化。", href: "/releases", icon: "monitor" },
      { title: "集成指南", description: "集成方式、流程与最佳实践说明。", href: "/compatibility", icon: "layers" },
      { title: "客户支持", description: "快速解决问题，获取帮助与反馈入口。", href: "/support", icon: "headphones" },
    ]);
  });
});
```

- [ ] **Step 2: Run the content test and verify it fails**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/home-content.test.ts
```

Expected: FAIL because capabilities are strings, approved descriptions and icon identifiers are missing, and the third resource still uses the old label.

- [ ] **Step 3: Replace the content arrays with typed objects**

Define and export the fixed copy at the top of `home-content.ts`:

```ts
export const homeCopy = {
  hero: {
    technicalLine: "国产算力 · 私有化部署 · 企业级 AI 开发",
    heading: { before: "让企业 ", emphasis: "AI", after: " 从模型走向业务" },
    productName: "华鲲元启 AI开发赋能平台",
    productCode: "TGDataXAI",
    summary: "以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系，让智能体开发像搭积木一样简单。",
    primaryCta: { label: "了解平台", href: "/product" },
    secondaryCta: { label: "阅读文档", href: "/docs" },
    evidenceLabel: "PLATFORM / UI-01",
    evidenceProduct: "TGDataXAI",
    evidenceCaption: "应用广场界面 · 用户提供的华鲲元启平台截图",
  },
  platform: {
    kicker: "PLATFORM / 01",
    heading: { before: "一套平台，贯通企业 ", emphasis: "AI", after: " 开发全流程" },
    intro: "从企业数据进入知识工程，到智能体发布与模型运行，能力被组织为可理解、可管理的开发路径。",
    primaryCta: { label: "了解平台", href: "/product" },
    secondaryCta: { label: "阅读文档", href: "/docs" },
  },
  enterprise: {
    kicker: "ENTERPRISE / 02",
    heading: "为企业边界而设计",
  },
  solutions: {
    kicker: "SOLUTIONS / 03",
    heading: { before: "从平台能力，走向", emphasis: "行业场景", after: "" },
    intro: "行业方案建立在统一平台之上。视觉检索是其中的多模态子能力，不是独立上位平台。",
  },
  resources: {
    kicker: "RESOURCES / 01",
    heading: { before: "下一步，从这里", emphasis: "开始", after: "" },
    intro: "为您准备了关键的资源与文档，助力快速上手平台，开启高效开发之旅。",
  },
} as const;
```

Then define and export this icon-name union:

```ts
export type HomeIconName =
  | "activity"
  | "box"
  | "code"
  | "database"
  | "eye"
  | "file"
  | "headphones"
  | "image"
  | "layers"
  | "message"
  | "monitor"
  | "network"
  | "shield";
```

Convert every array entry to an object with an `icon: HomeIconName`. Use these mappings:

```ts
capabilities: shield, box, code, activity
platformLayers: database, code, layers, shield
enterpriseProofs: database, file, code, shield
solutions: message, file, network, image, eye
resources: file, monitor, layers, headphones
```

Keep the platform, enterprise, and solution descriptions already present. Replace the resources with the exact reference descriptions:

```ts
[
  { title: "产品文档", description: "了解产品功能、使用方法和规范。", href: "/docs", icon: "file" },
  { title: "版本更新", description: "查看最新版本说明与迭代优化。", href: "/releases", icon: "monitor" },
  { title: "集成指南", description: "集成方式、流程与最佳实践说明。", href: "/compatibility", icon: "layers" },
  { title: "客户支持", description: "快速解决问题，获取帮助与反馈入口。", href: "/support", icon: "headphones" },
]
```

- [ ] **Step 4: Run the content test and verify it passes**

Format the two touched files, then run the same targeted Vitest command:

```bash
pnpm --filter @ai-agent-platform/web exec prettier --write src/components/home-content.ts src/components/home-content.test.ts
pnpm --filter @ai-agent-platform/web test -- src/components/home-content.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit the content contract**

```bash
git add apps/web/src/components/home-content.ts apps/web/src/components/home-content.test.ts
git diff --cached --name-only
git commit -m "test(home): lock reference content contract"
```

### Task 3: Rebuild the semantic section markup

**Files:**
- Create: `apps/web/src/components/home-icon.tsx`
- Modify: `apps/web/src/components/home-sections.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.test.tsx`
- Test: `apps/web/src/app/page.test.tsx`

- [ ] **Step 1: Replace incompatible dirty assertions with the approved failing structure test**

Keep the existing product-name, screenshot-alt, and no-legacy-brand assertions. Replace the singular CTA assertions, the assertion that requires `.home-hero__copy.home-glass-panel`, and the dark enterprise-glass assertions with this contract:

```ts
const home = screen.getByRole("main", { name: "华鲲元启门户首页" });
expect(home.querySelector(".home-atmosphere")).toHaveAttribute("aria-hidden", "true");
expect(
  [...home.querySelectorAll<HTMLElement>("[data-home-region]")].map(
    (region) => region.dataset.homeRegion,
  ),
).toEqual(["hero", "platform", "enterprise", "solutions", "resources", "closing"]);
expect(home.querySelector(".home-hero__copy")).not.toHaveClass("home-glass-panel");
expect(home.querySelectorAll(".home-capability-card")).toHaveLength(4);
expect(home.querySelectorAll(".home-platform-row")).toHaveLength(4);
expect(home.querySelectorAll(".home-enterprise-row")).toHaveLength(4);
expect(home.querySelectorAll(".home-solution-row")).toHaveLength(5);
expect(home.querySelectorAll(".home-resource")).toHaveLength(4);
expect(screen.getByText("安全合规 · 数据可控")).toBeVisible();
expect(screen.getByText("基于华鲲元启的行业子能力")).toBeVisible();
expect(screen.getByText("RESOURCES / 01")).toBeVisible();
expect(screen.getByRole("heading", { name: "下一步，从这里开始" })).toBeVisible();
expect(screen.queryByRole("img", { name: "华鲲元启" })).not.toBeInTheDocument();
for (const text of [
  "国产算力 · 私有化部署 · 企业级 AI 开发",
  "华鲲元启 AI开发赋能平台",
  "以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系，让智能体开发像搭积木一样简单。",
  "PLATFORM / UI-01",
  "应用广场界面 · 用户提供的华鲲元启平台截图",
  "PLATFORM / 01",
  "从企业数据进入知识工程，到智能体发布与模型运行，能力被组织为可理解、可管理的开发路径。",
  "ENTERPRISE / 02",
  "SOLUTIONS / 03",
  "行业方案建立在统一平台之上。视觉检索是其中的多模态子能力，不是独立上位平台。",
  "为您准备了关键的资源与文档，助力快速上手平台，开启高效开发之旅。",
]) {
  expect(screen.getByText(text)).toBeVisible();
}
expect(screen.getAllByText("TGDataXAI")).toHaveLength(2);
for (const heading of [
  "一套平台，贯通企业 AI 开发全流程",
  "为企业边界而设计",
  "从平台能力，走向行业场景",
  "下一步，从这里开始",
]) {
  expect(screen.getByRole("heading", { name: heading })).toBeVisible();
}
for (const link of screen.getAllByRole("link", { name: "了解平台" })) {
  expect(link).toHaveAttribute("href", "/product");
}
expect(screen.getAllByRole("link", { name: "了解平台" })).toHaveLength(2);
for (const link of screen.getAllByRole("link", { name: "阅读文档" })) {
  expect(link).toHaveAttribute("href", "/docs");
}
expect(screen.getAllByRole("link", { name: "阅读文档" })).toHaveLength(2);
const decorations = home.querySelectorAll<HTMLImageElement>(
  'img[data-home-decoration="true"]',
);
expect(decorations).toHaveLength(3);
for (const decoration of decorations) {
  expect(decoration).toHaveAttribute("alt", "");
  expect(decoration).toHaveAttribute("aria-hidden", "true");
}
```

Also assert resource hrefs by accessible name:

```ts
expect(screen.getByRole("link", { name: /集成指南/ })).toHaveAttribute(
  "href",
  "/compatibility",
);
```

- [ ] **Step 2: Run the page test and verify it fails**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/page.test.tsx
```

Expected: FAIL because region markers, new card/row classes, exact copy, and icon/illustration markup do not exist yet.

- [ ] **Step 3: Create the focused Lucide adapter**

Create `home-icon.tsx`:

```tsx
import {
  Activity,
  Box,
  Code2,
  Database,
  Eye,
  FileText,
  Headphones,
  ImageIcon,
  Layers3,
  MessageSquareText,
  MonitorUp,
  Network,
  ShieldCheck,
} from "lucide-react";
import type { HomeIconName } from "./home-content";

const icons = {
  activity: Activity,
  box: Box,
  code: Code2,
  database: Database,
  eye: Eye,
  file: FileText,
  headphones: Headphones,
  image: ImageIcon,
  layers: Layers3,
  message: MessageSquareText,
  monitor: MonitorUp,
  network: Network,
  shield: ShieldCheck,
} satisfies Record<HomeIconName, typeof Activity>;

export function HomeIcon({ name }: { name: HomeIconName }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" strokeWidth={1.8} />;
}
```

- [ ] **Step 4: Recompose the five reference regions**

In `home-sections.tsx`:

1. Remove the Hero wordmark import and markup.
2. Import the three generated WebP files and the existing `platform-overview.png`.
3. Render `data-home-region="hero"` on Hero.
4. Export a `PlatformOverview` wrapper with `data-home-region="platform"`; keep capability and platform-flow rendering as focused internal functions.
5. Render `data-home-region="enterprise"`, `solutions`, `resources`, and `closing` on the remaining top-level regions.
6. Apply the stable classes used by the test: `.home-capability-card`, `.home-platform-row`, `.home-enterprise-row`, `.home-solution-row`, `.home-resource`.
7. Use `HomeIcon` inside a `.home-icon-shell` for every reference icon.
8. Add decorative arrows with `aria-hidden="true"`; do not turn platform, enterprise, or solution rows into fake links.
9. Keep only real CTAs and resource rows interactive.
10. Render generated images with `alt=""` and `aria-hidden="true"`; keep the product screenshot alt as `华鲲元启应用广场界面`.
11. Import `homeCopy` and render every fixed label, structured heading segment, introduction, product string, redesigned CTA label/href, and evidence caption from it; do not duplicate those values inline.

Use these exact component contracts:

Fixed section copy must be rendered from `homeCopy` verbatim:

```text
Hero technical pill: 国产算力 · 私有化部署 · 企业级 AI 开发
Hero heading: 让企业 AI 从模型走向业务
Hero product line: 华鲲元启 AI开发赋能平台 | TGDataXAI
Hero summary: 以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系，让智能体开发像搭积木一样简单。
Hero CTAs: 了解平台 | 阅读文档
Hero evidence labels: PLATFORM / UI-01 | TGDataXAI
Hero evidence caption: 应用广场界面 · 用户提供的华鲲元启平台截图

Platform kicker: PLATFORM / 01
Platform heading: 一套平台，贯通企业 AI 开发全流程
Platform intro: 从企业数据进入知识工程，到智能体发布与模型运行，能力被组织为可理解、可管理的开发路径。
Platform CTAs: 了解平台 | 阅读文档

Enterprise kicker: ENTERPRISE / 02
Enterprise heading: 为企业边界而设计

Solutions kicker: SOLUTIONS / 03
Solutions heading: 从平台能力，走向行业场景
Solutions intro: 行业方案建立在统一平台之上。视觉检索是其中的多模态子能力，不是独立上位平台。

Resources kicker: RESOURCES / 01
Resources heading: 下一步，从这里开始
Resources intro: 为您准备了关键的资源与文档，助力快速上手平台，开启高效开发之旅。
```

| Component | Required semantic and visual structure |
|---|---|
| `HeroEvidence` | Top-level `<section className="home-section home-hero" data-home-region="hero" aria-labelledby="hero-title">`; `.home-hero__copy` contains the technical pill, one `h1`, product name, summary, `homeCopy.hero.primaryCta`, and `homeCopy.hero.secondaryCta` in that order; sibling `<figure className="home-evidence home-glass-panel">` contains the PLATFORM/TGDataXAI bar, existing product screenshot, and source caption. The copy does not receive `home-glass-panel`. |
| `PlatformOverview` | One top-level `<section className="home-section home-platform-overview" data-home-region="platform" aria-label="平台能力与开发流程">`. It first renders `.home-capability-rail` containing four `.home-capability-card` articles and three decorative connector arrows between adjacent cards. It then renders `.home-platform__grid`. |
| Platform narrative panel | `.home-platform__intro.home-glass-panel` contains `PLATFORM / 01`, the exact heading, the approved intro, links rendered from `homeCopy.platform.primaryCta` and `homeCopy.platform.secondaryCta`, and the platform-loop `Image` with `data-home-decoration="true"`, `alt=""`, and `aria-hidden="true"`. |
| Platform list panel | `.home-platform__list.home-glass-panel` contains four `.home-platform-row` articles. Each article contains `.home-icon-shell`, code, `h3`, description, and one decorative arrow in that order. |
| `EnterpriseProof` | Top-level section uses `data-home-region="enterprise"`; `.home-enterprise__heading.home-glass-panel` contains `ENTERPRISE / 02`, `h2`, and the short violet underline; `.home-enterprise__list.home-glass-panel` contains four `.home-enterprise-row` articles with icon shell, two-digit number, `h3`, and description. Both panels are light glass. |
| `SolutionIndex` | Top-level section uses `data-home-region="solutions"`; `.home-solutions__grid` contains `.home-solutions__intro.home-glass-panel` and `.home-solution-list.home-glass-panel`. The intro contains `SOLUTIONS / 03`, exact heading and intro, plus the solutions-platform decoration with the three required decorative-image attributes. The list contains five `.home-solution-row` articles; S5 additionally receives `.home-solution-row--subset`, the subset label, and violet emphasis. |
| `ResourceTable` | Top-level section uses `data-home-region="resources"`; `.home-resources__grid` contains `.home-resources__intro.home-glass-panel` and `.home-resource-list.home-glass-panel`. The intro contains `RESOURCES / 01`, exact heading and intro, plus the resources-folder decoration with the three required decorative-image attributes. The list contains four `<Link className="home-resource">` rows with icon shell, title, description, and circular decorative arrow. |
| `PrivateDeploymentClose` | Keep the existing heading, paragraph, `/contact` CTA, and `/docs` CTA exactly as they are. Add only `data-home-region="closing"` to the existing top-level section. |

Render all four gradient headings through one deterministic helper so the visible and accessible text comes entirely from `homeCopy`:

```tsx
type GradientHeadingCopy = {
  before: string;
  emphasis: string;
  after: string;
};

function GradientHeadingText({ copy }: { copy: GradientHeadingCopy }) {
  return (
    <>
      {copy.before}
      <span className="home-gradient-text">{copy.emphasis}</span>
      {copy.after}
    </>
  );
}

<h1 id="hero-title">
  <GradientHeadingText copy={homeCopy.hero.heading} />
</h1>
```

Use `GradientHeadingText` for the platform, solutions, and resources `h2` elements as well. Their concatenated accessible names must remain exactly the full headings asserted in `page.test.tsx`.

- [ ] **Step 5: Add the atmosphere and approved region order in `page.tsx`**

Use:

```tsx
<main className="home" aria-label="华鲲元启门户首页">
  <div className="home-atmosphere" aria-hidden="true">
    <span />
    <span />
    <span />
  </div>
  <HeroEvidence />
  <PlatformOverview />
  <EnterpriseProof />
  <SolutionIndex />
  <ResourceTable />
  <PrivateDeploymentClose />
</main>
```

- [ ] **Step 6: Run targeted unit tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec prettier --write src/components/home-icon.tsx src/components/home-sections.tsx src/app/page.tsx src/app/page.test.tsx
pnpm --filter @ai-agent-platform/web test -- src/components/home-content.test.ts src/app/page.test.tsx
```

Expected: PASS. React must emit no invalid nesting or missing-key warnings.

- [ ] **Step 7: Run typecheck before styling**

Run:

```bash
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: PASS with no icon-map or static-image type errors.

- [ ] **Step 8: Commit semantic structure only**

```bash
git add apps/web/src/components/home-icon.tsx apps/web/src/components/home-sections.tsx apps/web/src/app/page.tsx apps/web/src/app/page.test.tsx
git diff --cached --name-only
git commit -m "feat(home): rebuild reference section structure"
```

Expected: no navbar, assistant, shell, or `.superpowers` path is staged.

---

## Chunk 2: Visual implementation, responsive behavior, and verification

### Task 4: Implement the reference layout through browser-verifiable CSS

**Files:**
- Create: `apps/web/e2e/home-reference-layout.spec.ts`
- Modify: `apps/web/src/components/home.css`
- Test: `apps/web/e2e/home-reference-layout.spec.ts`

- [ ] **Step 1: Write the failing layout regression test**

Create `home-reference-layout.spec.ts`:

```ts
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function gotoHome(page: Page, reducedMotion: "reduce" | "no-preference" = "reduce") {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
}

function collectDiagnostics(page: Page) {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (error === "net::ERR_ABORTED" && request.url().includes("_rsc")) return;
    if (request.resourceType() === "image") {
      diagnostics.push(`image request failed: ${request.url()} (${error})`);
    }
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && response.status() >= 400) {
      diagnostics.push(`image response ${response.status()}: ${response.url()}`);
    }
  });
  return diagnostics;
}

function luminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test("keeps all homepage controls accessible and prevents overflow", async ({ page }) => {
  await gotoHome(page);
  await expectNoHorizontalOverflow(page);
  const controls = page.locator("main.home a, main.home button");
  expect(await controls.count()).toBeGreaterThan(0);
  const metadata = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        name: element.getAttribute("aria-label")?.trim() || element.textContent?.trim() || "",
        tabIndex: (element as HTMLElement).tabIndex,
        width: rect.width,
      };
    }),
  );
  for (const item of metadata) {
    expect(item.height).toBeGreaterThanOrEqual(44);
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.name).not.toBe("");
    expect(item.tabIndex).toBeGreaterThanOrEqual(0);
  }

  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    await control.focus();
    await expect(control).toBeFocused();
    const focus = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focus.outlineStyle).not.toBe("none");
    expect(parseFloat(focus.outlineWidth)).toBeGreaterThan(0);
  }
});

test("matches the approved desktop composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHome(page);

  const hero = await page.locator(".home-hero__grid").boundingBox();
  const copy = await page.locator(".home-hero__copy").boundingBox();
  const evidence = await page.locator(".home-evidence").boundingBox();
  expect(hero).not.toBeNull();
  expect(copy).not.toBeNull();
  expect(evidence).not.toBeNull();
  expect(copy!.x).toBeLessThan(evidence!.x);
  expect(evidence!.width).toBeGreaterThan(copy!.width);
  expect(copy!.width / hero!.width).toBeGreaterThan(0.34);
  expect(copy!.width / hero!.width).toBeLessThan(0.48);

  const capabilityTops = await page.locator(".home-capability-card").evaluateAll(
    (cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)),
  );
  expect(new Set(capabilityTops).size).toBe(1);

  for (const selector of [".home-platform__grid", ".home-solutions__grid", ".home-resources__grid"]) {
    const columns = await page.locator(selector).evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    );
    expect(columns).toBe(2);
  }
});

test("stacks reference regions without clipping on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHome(page);

  await expectNoHorizontalOverflow(page);
  const heroCopy = await page.locator(".home-hero__copy").boundingBox();
  const evidence = await page.locator(".home-evidence").boundingBox();
  expect(heroCopy).not.toBeNull();
  expect(evidence).not.toBeNull();
  expect(evidence!.y).toBeGreaterThan(heroCopy!.y + heroCopy!.height);

  const capabilityColumns = await page.locator(".home-capability-rail").evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
  );
  expect(capabilityColumns).toBe(2);

  for (const selector of [".home-platform__grid", ".home-solutions__grid", ".home-resources__grid"]) {
    const columns = await page.locator(selector).evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    );
    expect(columns).toBe(1);
  }
});

test("removes decorative motion when reduced motion is requested", async ({ page }) => {
  await gotoHome(page, "reduce");
  const motion = await page
    .locator(".home-atmosphere span, main.home [data-home-region]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationName: style.animationName,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
        };
      }),
    );
  for (const item of motion) {
    expect(item.animationName).toBe("none");
    expect(item.transform).toBe("none");
  }

  const resource = page.locator(".home-resource").first();
  await resource.hover();
  const interactiveMotion = await resource.evaluate((element) => {
    const style = getComputedStyle(element);
    return { transform: style.transform, transitionDuration: style.transitionDuration };
  });
  expect(interactiveMotion.transform).toBe("none");
  expect(interactiveMotion.transitionDuration.split(", ").every((value) => value === "0s")).toBe(true);
});

test("uses AA-safe homepage text tokens", async ({ page }) => {
  await gotoHome(page);
  const tokens = await page.locator("main.home").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      blueText: style.getPropertyValue("--home-blue-text").trim(),
      canvas: style.getPropertyValue("--home-canvas").trim(),
      ink: style.getPropertyValue("--home-ink").trim(),
      muted: style.getPropertyValue("--home-muted").trim(),
      violet: style.getPropertyValue("--home-violet").trim(),
    };
  });
  expect(contrastRatio(tokens.blueText, tokens.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.ink, tokens.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.muted, tokens.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.violet, tokens.canvas)).toBeGreaterThanOrEqual(4.5);
});

test("loads without console, React, or image diagnostics", async ({ page }) => {
  const diagnostics = collectDiagnostics(page);
  await gotoHome(page);
  await page.waitForTimeout(250);
  expect(diagnostics).toEqual([]);
});

test("captures named visual evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const outputDirectory = resolve(process.cwd(), "../../artifacts/playwright/home-reference");
  await mkdir(outputDirectory, { recursive: true });
  for (const evidence of [
    { name: "home-1440", width: 1440, height: 1000, reducedMotion: "no-preference" as const },
    { name: "home-768", width: 768, height: 1024, reducedMotion: "no-preference" as const },
    { name: "home-390", width: 390, height: 844, reducedMotion: "no-preference" as const },
    { name: "home-1440-reduced", width: 1440, height: 1000, reducedMotion: "reduce" as const },
  ]) {
    await page.setViewportSize({ width: evidence.width, height: evidence.height });
    await gotoHome(page, evidence.reducedMotion);
    await page.screenshot({
      path: resolve(outputDirectory, `${evidence.name}.png`),
      fullPage: true,
    });
  }
});
```

- [ ] **Step 2: Build and run the new browser test to verify it fails**

Run:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --project=mobile
```

Expected: FAIL on old desktop proportions, missing new grid selectors, mobile composition, or reduced-motion behavior.

- [ ] **Step 3: Rewrite `home.css` around scoped homepage tokens**

At the top of `.home`, define:

```css
.home {
  --home-canvas: #f4f7ff;
  --home-panel: rgb(255 255 255 / 76%);
  --home-panel-strong: rgb(255 255 255 / 88%);
  --home-border: rgb(255 255 255 / 88%);
  --home-ink: #101a42;
  --home-muted: #5f6b8c;
  --home-blue: #286cff;
  --home-blue-text: #1557d5;
  --home-violet: #7358ea;
  --home-shadow: 0 20px 64px rgb(58 78 160 / 11%);
  position: relative;
  isolation: isolate;
  overflow: clip;
  color: var(--home-ink);
  background: var(--home-canvas);
}

.home-glass-panel {
  border: 1px solid var(--home-border);
  background: var(--home-panel);
  box-shadow: var(--home-shadow), inset 0 1px 0 rgb(255 255 255 / 90%);
  backdrop-filter: blur(20px);
}
```

Implement the approved desktop grids exactly:

```css
.home-hero__grid { grid-template-columns: minmax(0, 41fr) minmax(0, 59fr); }
.home-platform__grid { grid-template-columns: minmax(0, 43fr) minmax(0, 57fr); }
.home-solutions__grid { grid-template-columns: minmax(0, 36fr) minmax(0, 64fr); }
.home-resources__grid { grid-template-columns: minmax(0, 35fr) minmax(0, 65fr); }
.home-capability-rail { grid-template-columns: repeat(4, minmax(0, 1fr)); }
```

Complete the remaining selectors using the approved spec, with these non-negotiable values:

- `.home-frame`: `width: min(100% - 80px, 1360px)`.
- Major section vertical padding: `clamp(72px, 8vw, 128px)`.
- Major glass panel radius: `clamp(28px, 2.5vw, 44px)`.
- Row and capability-card radius: 18–26px.
- Hero minimum height: between 760px and 860px below the unchanged navbar.
- Hero screenshot remains larger than the copy column and preserves aspect ratio.
- Enterprise heading and list are separate light glass panels; do not reuse the old dark enterprise theme.
- S5 has a pale violet fill, violet left rule, and no dark hover inversion.
- The retained `.home-closing` keeps its current dark content and links; only its top spacing/background transition may change.
- No homepage selector may target `.portal-header`, `.site-navigation`, `.mobile-navigation`, or any navbar class.

Implement and organize `home.css` in these explicit section blocks. Keep the single file at or below 900 lines by sharing tokens and common selectors; if a draft exceeds the limit, remove duplication before committing rather than introducing another stylesheet.

| CSS block | Required selectors and states |
|---|---|
| Foundation | `.home`, `.home-frame`, `.home-atmosphere`, `.home-atmosphere span`, `.home-glass-panel`, `.home-gradient-text`; atmosphere stays behind content with `pointer-events:none`; gradient text retains a readable solid-color fallback before background clipping. |
| Shared typography/actions | `.home-technical-line`, `.home-section-kicker`, `.home-action`, `.home-action--primary`, `.home-row-arrow`, `.home-icon-shell`; all normal-sized blue labels/codes use `--home-blue-text`; `--home-blue` is restricted to large gradient text, icon fills, buttons, and decoration; buttons are at least 44px high; `:focus-visible` uses a 3px outline with 3–4px offset; hover uses only a 2–3px lift and border/shadow change. |
| Hero | `.home-hero`, `.home-hero__grid`, `.home-hero__copy`, `.home-hero h1`, `.home-product-name`, `.home-hero__summary`, `.home-evidence`, `.home-evidence__bar`, `.home-evidence img`, `.home-evidence figcaption`; copy remains unboxed; screenshot uses `aspect-ratio` and `object-fit:contain`; the light trail is a pseudo-element below content. |
| Capability chain | `.home-capability-rail`, `.home-capability-card`, `.home-capability-card__code`, `.home-capability-card__copy`, `.home-capability-connector`; cards align to equal height, icons sit at the upper right, connectors never participate in keyboard order and hide when the grid becomes two columns. |
| Platform | `.home-platform__grid`, `.home-platform__intro`, `.home-platform__illustration`, `.home-platform__list`, `.home-platform-row`, and child code/title/description/arrow selectors; narrative panel reserves a bottom illustration zone; rows have consistent minimum height and a 1px divider without separate floating-card shadows. |
| Enterprise | `.home-enterprise`, `.home-enterprise__heading`, `.home-enterprise__list`, `.home-enterprise-row`; both panels are light; the heading has the short violet underline; desktop rows use icon/number/title/description columns and collapse to two logical rows on mobile. |
| Solutions | `.home-solutions__grid`, `.home-solutions__intro`, `.home-solutions__illustration`, `.home-solution-list`, `.home-solution-row`, `.home-solution-row--subset`, `.home-subset-label`; illustration stays inside the left panel; S5 receives a pale violet fill and left rule; normal rows remain neutral on hover. |
| Resources | `.home-resources__grid`, `.home-resources__intro`, `.home-resources__illustration`, `.home-resource-list`, `.home-resource`, `.home-resource__arrow`; the entire row is one link, icons and arrow circles never shrink, descriptions wrap without clipping, and hover never inverts to a dark background. |
| Retained close | `.home-closing`, `.home-closing__grid`, `.home-closing .home-action`; preserve the existing dark palette and content; use only a soft top radial transition from the preceding light section. |
| Motion/fallbacks | `@keyframes home-region-enter`, `@keyframes home-atmosphere-drift`, hover-capable media query, reduced-motion query, and no-backdrop-filter query; no `transition: all`; images always have stable dimensions. |

- [ ] **Step 4: Implement responsive rules**

Use these breakpoints:

```css
@media (max-width: 1179px) {
  .home-hero__grid,
  .home-platform__grid,
  .home-solutions__grid,
  .home-resources__grid { grid-template-columns: 1fr; }
  .home-capability-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 759px) {
  .home-frame { width: calc(100% - 32px); }
  .home-capability-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 430px) {
  .home-capability-card { min-height: 150px; }
}
```

Keep the 2×2 capability layout at 390px as approved. Stack all narrative/list pairs. Constrain illustration width with `clamp()` and anchor it to the bottom of its narrative panel without absolute positioning that can cover text.

- [ ] **Step 5: Implement motion and fallbacks**

Use named keyframes only for section entrance and atmosphere drift. Set explicit property transitions; never use `transition: all`.

```css
@media (prefers-reduced-motion: reduce) {
  .home *,
  .home *::before,
  .home *::after {
    scroll-behavior: auto;
  }
  .home-atmosphere span,
  .home [data-home-region] {
    animation: none;
    transform: none;
  }
  .home a,
  .home button,
  .home .home-row-arrow {
    transition-duration: 0s;
  }
  .home a:hover,
  .home button:hover,
  .home a:active,
  .home button:active {
    transform: none;
  }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .home-glass-panel,
  .home-capability-card,
  .home-icon-shell {
    background: rgb(250 252 255 / 96%);
  }
}
```

- [ ] **Step 6: Rebuild and run the browser regression**

Run the same build and Playwright commands from Step 2.

Expected: PASS in both desktop and mobile projects; no horizontal overflow; desktop has the approved ratios; mobile stacks correctly; reduced motion disables drift.

- [ ] **Step 7: Run unit, type, lint, and formatting checks**

```bash
pnpm --filter @ai-agent-platform/web exec prettier --write src/components/home-content.ts src/components/home-content.test.ts src/components/home-icon.tsx src/components/home-sections.tsx src/components/home.css src/app/page.tsx src/app/page.test.tsx e2e/home-reference-layout.spec.ts
pnpm --filter @ai-agent-platform/web test -- src/components/home-content.test.ts src/app/page.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web exec eslint src/components/home-content.ts src/components/home-content.test.ts src/components/home-icon.tsx src/components/home-sections.tsx src/app/page.tsx src/app/page.test.tsx e2e/home-reference-layout.spec.ts --max-warnings=0
pnpm --filter @ai-agent-platform/web exec prettier --check src/components/home-content.ts src/components/home-content.test.ts src/components/home-icon.tsx src/components/home-sections.tsx src/components/home.css src/app/page.tsx src/app/page.test.tsx e2e/home-reference-layout.spec.ts
```

Expected: all targeted commands PASS with zero warnings. Then run the whole web lint and format checks. They must pass, or reproduce only the unrelated failures recorded in `/tmp/home-redesign-*-baseline.log`; any touched homepage-path failure blocks completion.

- [ ] **Step 8: Commit layout and browser regression**

```bash
git add apps/web/src/components/home.css apps/web/e2e/home-reference-layout.spec.ts
git diff --cached --name-only
git commit -m "feat(home): match reference layouts and motion"
```

### Task 5: Perform visual QA and final scope verification

**Files:**
- Modify if needed: `apps/web/src/components/home.css`
- Modify if needed: `apps/web/src/components/home-sections.tsx`
- Modify if needed: `apps/web/src/assets/home/**`
- Verify: `apps/web/src/app/page.test.tsx`
- Verify: `apps/web/e2e/home-reference-layout.spec.ts`

- [ ] **Step 1: Capture full-page browser screenshots**

Run the evidence-producing test:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --project=mobile
```

The Playwright `webServer` starts `node .next/standalone/apps/web/server.js` and waits for `/api/health/live`. The named evidence test creates exactly:

- `artifacts/playwright/home-reference/home-1440.png` — 1440×1000 desktop full page.
- `artifacts/playwright/home-reference/home-768.png` — 768×1024 tablet full page.
- `artifacts/playwright/home-reference/home-390.png` — 390×844 mobile full page.
- `artifacts/playwright/home-reference/home-1440-reduced.png` — 1440×1000 desktop with reduced motion.

Save evidence under `artifacts/playwright/home-reference/`; do not commit generated screenshots.

- [ ] **Step 2: Compare each homepage region against its matching reference**

Compare in order:

1. `home-1440.png` Hero against `docs/design/references/home-reference/reference-01-hero.webp`: copy/screenshot balance and bottom light trail.
2. `home-1440.png` platform region against `docs/design/references/home-reference/reference-02-platform.webp`: four capability cards and 43/57 platform split.
3. `home-1440.png` enterprise region against `docs/design/references/home-reference/reference-03-enterprise.webp`: title panel and four-row list spacing.
4. `home-1440.png` solutions region against `docs/design/references/home-reference/reference-04-solutions.webp`: 36/64 split and S5 highlight.
5. `home-1440.png` resources region against `docs/design/references/home-reference/reference-05-resources.webp`: 35/65 split and four link rows.
6. `home-768.png` and `home-390.png` against the approved responsive rules: stacking order, 2×2 capability cards, readable titles, contained images, and no clipping.

Correct visible mismatches in typography, spacing, panel radius, illustration scale, icon size, glass opacity, and shadow strength. Do not change navbar files during polish.

- [ ] **Step 3: Verify the navbar was not modified**

Run:

```bash
git diff -- packages/ui/src/navigation
git diff --cached --name-only
```

Expected: no diff under `packages/ui/src/navigation`; staged paths, if any, are homepage-only.

- [ ] **Step 4: Run the final verification suite**

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/home-content.test.ts src/app/page.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web exec eslint src/components/home-content.ts src/components/home-content.test.ts src/components/home-icon.tsx src/components/home-sections.tsx src/app/page.tsx src/app/page.test.tsx e2e/home-reference-layout.spec.ts --max-warnings=0
pnpm --filter @ai-agent-platform/web exec prettier --check src/components/home-content.ts src/components/home-content.test.ts src/components/home-icon.tsx src/components/home-sections.tsx src/components/home.css src/app/page.tsx src/app/page.test.tsx e2e/home-reference-layout.spec.ts
pnpm --filter @ai-agent-platform/web lint
pnpm --filter @ai-agent-platform/web format:check
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts --project=desktop --project=mobile
```

Expected: targeted checks, unit tests, typecheck, build, and Playwright PASS. The Playwright diagnostics test asserts there is no console/React error, page error, failed image request, or image HTTP error; its contrast test asserts all four normal-sized homepage text tokens meet the 4.5:1 AA threshold. Whole-app lint and format must pass or reproduce only the unrelated baseline failures with no touched homepage path.

- [ ] **Step 5: Commit only final visual corrections, if any**

```bash
git add apps/web/src/components/home.css apps/web/src/components/home-sections.tsx apps/web/src/assets/home apps/web/src/app/page.test.tsx apps/web/e2e/home-reference-layout.spec.ts
git diff --cached --name-only
git commit -m "fix(home): finish reference visual parity"
```

Skip this commit when Step 2 required no file changes. Never stage unrelated existing changes.

- [ ] **Step 6: Report verification evidence**

Report:

- final commit hashes;
- exact passing commands;
- desktop/tablet/mobile screenshot paths;
- confirmation that navbar files were untouched;
- any remaining subjective visual difference that could not be eliminated without changing the approved content or navbar.
