# Footer 浅灰柔光渐变设计

日期：2026-07-20

## 背景

当前公开站点共用 `SiteFooter`。它已经具备完整的四组导航、合法的路由适配、桌面/平板/移动端列数契约和 44px 移动触点，但视觉层级偏弱：纯白底与正文区域区分不足，品牌区信息密度低，左侧强调线重复且显得零散。

用户确认采用“浅灰柔光基座”方向：保留现有内容和数据来源，重做 Footer 的视觉层级、背景与响应式细节。

## 目标

1. 让 Footer 成为公开页面稳定、清晰的结束区域。
2. 使用克制的浅灰渐变增加空间感，不抢正文和导航内容。
3. 保留全部现有链接、链接顺序、品牌文案和法务状态文案。
4. 保持现有语义、路由适配、响应式列数和可访问性契约。
5. 首页深色 Private Deployment 收口保持原样，Footer 在其后形成明确的浅色分区。

## 非目标

- 不修改 Header、首页内容区或 Private Deployment 收口。
- 不新增、删除或重命名 Footer 导航链接。
- 不修改 `footerNavigation` 的分组、顺序或路由。
- 不添加社交媒体、订阅表单、二维码、图标或虚构公司信息。
- 不新增 JavaScript、折叠菜单或动画。
- 不复刻 Apple 的版式、品牌资产或专有视觉元素。

## 视觉方向

参考 Apple 官网的克制感，仅借鉴低对比中性色和柔和空间层次；最终渐变、信息结构和品牌表达均沿用当前项目设计系统。

### 背景

Footer 主背景由三层组成：

1. 左上近白柔光，扩大亮部但不形成明显光斑。
2. 右侧极淡的品牌冷灰蓝，品牌蓝不透明度控制在约 9%。
3. 从 `#FBFCFD` 到 `#E9EEF5` 的中性浅灰线性渐变。

渐变必须满足：

- 不出现紫蓝霓虹、彩虹或高饱和光斑。
- 导航区域无需额外卡片承载。
- 文字对比度不能依赖背景具体位置。
- 在不支持混合或模糊效果时仍呈现可读的浅灰底。

### 品牌区

- 保留 `AI Agent Platform` 和 `Build Enterprise AI Faster` 原文。
- 使用现有 `--font-display` 与 `--font-body`。
- 用一条 38px 宽、3px 高的 `--color-signal` 短线作为唯一品牌信号。
- 品牌区与导航在桌面端用中性细线分隔，不使用卡片或左侧彩色边框。

### 导航区

- 四个分组标题使用深色正文色和 Display 字体。
- 链接使用现有 muted 色，悬停时切换为 `--color-primary`。
- 不添加装饰图标、序号或箭头。
- 保留当前链接顺序和路由适配组件。

### 底部信息区

- 保留以下三条真实状态文案，不填写虚构内容：
  - `公司信息待补充`
  - `隐私政策（占位）`
  - `备案信息（占位）`
- 使用略深的半透明浅灰层与顶部细线区分主导航。
- `prefers-reduced-transparency: reduce` 下取消模糊并使用实色 `#EEF2F7`。

## 结构

`SiteFooter` 继续输出一个语义化 `<footer>`：

1. `portal-footer__main`
   - `portal-footer__brand`
   - `nav[aria-label="页脚导航"]`
2. `portal-footer__meta`

允许在品牌区增加一个纯装饰的 signal 元素。该元素必须设置 `aria-hidden="true"`，不能成为图片、链接或额外标题。

## 响应式规则

沿用现有断点，不引入新的行为模式：

- `> 1180px`：品牌区与四列导航并排。
- `721px–1180px`：品牌区在上，导航为两列。
- `<= 720px`：品牌区、四个导航分组和底部信息依次单列展开。

移动端要求：

- 不使用折叠面板，所有链接直接可见。
- 每个链接最小高度保持 44px。
- 组间使用中性细线，不使用独立卡片。
- 页面不得出现横向滚动或文字裁切。

## 交互与可访问性

- 保留 `<footer>` landmark 和命名为“页脚导航”的 `<nav>`。
- 保留原生链接或注入的 anchor-compatible 路由组件。
- 悬停只改变文字颜色，不做明显位移。
- `:focus-visible` 继续使用 3px `--color-accent` 焦点环。
- 装饰 signal 不进入可访问性树。
- 法务状态文案继续使用普通文本，不伪装成链接或按钮。

## 实现边界

预计只修改：

- `packages/ui/src/navigation/site-footer.tsx`
- `packages/ui/src/navigation/navigation.css`
- `packages/ui/src/navigation/site-footer.test.tsx`

只有在现有浏览器回归断言需要补充时，才修改：

- `docs/testing/navigation-browser-regression.js`

不修改：

- `apps/web/src/config/navigation.ts`
- `apps/web/src/components/home.css`
- `apps/web/src/components/home-sections.tsx`
- `packages/ui/src/tokens.css`

## 测试与验收

### 组件测试

- Footer landmark、品牌原文和命名导航仍存在。
- 四组导航及所有链接保持原顺序。
- 路由适配组件继续生效。
- action-only 项目不会被渲染为链接或按钮。
- 三条法务状态文案仍为普通文本。
- 新增 signal 设置 `aria-hidden="true"`。

### CSS 与浏览器回归

- 1440px：四列导航，品牌区与导航并排。
- 900px：两列导航，无横向溢出。
- 390px：单列导航，所有可见链接触点至少 44px。
- 首页：深色 Private Deployment 区域内容和样式不变，Footer 紧随其后显示浅灰柔光渐变。
- 其他公开页面：Footer 视觉一致。
- Console、CMS 和认证页面：不出现公开 Footer。
- 键盘焦点清晰，控制台无错误。

### 验证命令

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/site-footer.test.tsx
pnpm --filter @ai-agent-platform/ui test
pnpm typecheck
```

最后使用真实浏览器检查 1440px、900px 和 390px 三个视口。

## 已确认设计稿

- `docs/design/footer-soft-light-gradient-v3.html`
