# PRD Banner 与页面目录骨架设计

> 日期：2026-07-10  
> 状态：待用户书面审查  
> 范围：顶部品牌区、主导航、Next.js页面目录骨架

## 目标

1. 修正当前页头品牌名与PRD不一致的问题。
2. 使用Google Fonts中的英文书法字体呈现主标题，但不改变首页中文叙事标题。
3. 将当前只存在于`routeRegistry`和`[...slug]`兜底页中的模块，落实为真实、可见、可独立开发的Next.js目录。
4. 保持License、下载、OpenLab及其他外部能力为禁用占位，不伪造数据和可用状态。

## 顶部品牌区

### 文案

- 主标题：`AI Agent Platform`
- 副标题：`Build Enterprise AI Faster`
- 首页中文主标题“让企业 AI 从模型走向业务”保持不变。
- 首页仍可保留华鲲元启产品截图及产品能力叙事；页头使用PRD的门户产品名。

### 字体

- 主标题使用`Kaushan Script`。
- 来源：Google Fonts官方字体库与`google/fonts`官方仓库。
- 许可：SIL Open Font License 1.1。
- 字体文件和OFL许可文件保存到`apps/web/src/assets/fonts/kaushan-script/`，通过`next/font/local`加载。
- 页面运行和Docker部署不依赖Google CDN；字体随构建产物自托管。
- 副标题继续使用项目等宽字体，避免两层书法字体降低识别度。

### 视觉规格

- 主标题只应用于页头左侧品牌区，桌面约24px，移动端约20px。
- 副标题桌面约9–10px，使用较宽字距；窄屏可隐藏，主标题必须保留。
- 继续使用蓝、靛、紫细窄光谱线，不增加大面积渐变。
- 品牌链接的可访问名称改为“AI Agent Platform 首页”。
- 所有导航及移动菜单交互目标不小于44px。

## 主导航

按本地PRD第5.1节统一为：

| 名称        | 地址             |
| ----------- | ---------------- |
| 产品        | `/product`       |
| 文档        | `/docs`          |
| 版本        | `/releases`      |
| 兼容矩阵    | `/compatibility` |
| Marketplace | `/marketplace`   |
| 支持        | `/support`       |

登录入口保持`/login`。移动端继续使用原生`details/summary`导航。

## 页面目录骨架

### 原则

- 以`docs/product/PRD.md`和`apps/web/src/config/routes.ts`中已经登记的路由为当前事实源。
- 每个已登记模块创建真实目录和`page.tsx`，不再全部依赖`[...slug]`。
- 动态详情使用Next.js动态目录，例如`product/[slug]`、`releases/[version]`。
- `[...slug]`保留为登记路由遗漏和未知地址的兜底层。
- 页面文件保持薄层，只负责路由参数和模块装配；通用状态渲染放在共享组件。

### 公开门户

```text
apps/web/src/app/
├── product/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── releases/
│   ├── page.tsx
│   └── [version]/page.tsx
├── roadmap/page.tsx
├── downloads/page.tsx
├── openlab/page.tsx
├── docs/page.tsx
├── compatibility/page.tsx
├── marketplace/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── support/page.tsx
├── help/page.tsx
├── blog/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── cases/page.tsx
├── contact/page.tsx
└── login/page.tsx
```

### 客户控制台

```text
apps/web/src/app/console/
├── layout.tsx
├── page.tsx
├── profile/page.tsx
├── licenses/page.tsx
├── downloads/page.tsx
├── openlab/page.tsx
├── tickets/page.tsx
├── resources/page.tsx
├── api-keys/page.tsx
├── team/page.tsx
└── billing/page.tsx
```

### 运营后台

```text
apps/web/src/app/admin/
├── layout.tsx
├── page.tsx
├── site/page.tsx
├── navigation/page.tsx
├── products/page.tsx
├── releases/page.tsx
├── blog/page.tsx
├── cases/page.tsx
├── faq/page.tsx
├── compatibility/page.tsx
├── marketplace/page.tsx
├── users/page.tsx
├── roles/page.tsx
└── audit-logs/page.tsx
```

### 共享边界

```text
apps/web/src/
├── components/
│   ├── portal/README.md
│   ├── console/README.md
│   ├── admin/README.md
│   └── route-scaffold/
│       ├── registered-route-page.tsx
│       └── README.md
├── assets/
│   ├── fonts/
│   └── huakun-yuanqi/
└── config/
    └── routes.ts
```

- `route-scaffold`提供统一的搭建中和功能禁用页面。
- 公开门户、控制台和后台组件不互相混放。
- 三类组件目录用`README.md`记录边界，保证Git可追踪；某个模块进入正式开发时再增加实际业务组件。

## 路由状态

| 状态          | 含义               | 页面行为                               |
| ------------- | ------------------ | -------------------------------------- |
| `live`        | 已实现             | 渲染正式页面                           |
| `scaffold`    | 目录和页面壳已建立 | 显示“页面结构已建立”                   |
| `placeholder` | 依赖外部能力       | 显示“功能尚未开放”和`FEATURE_DISABLED` |

下载中心、OpenLab、License及其控制台入口继续保持`placeholder`。

## 测试与验收

1. AppShell测试先验证旧品牌和旧导航不再满足新契约，再实现GREEN。
2. 字体文件、OFL许可和CSS变量必须存在；生产构建不得请求Google CDN。
3. 路由测试验证PRD登记路由仍可匹配，代表性明确目录页面能渲染正确状态。
4. 浏览器验证1440×1000和390×844：标题不截断、导航可用、无横向溢出、控制台无错误。
5. 运行全量测试、类型检查、Lint、格式检查和Next.js生产构建。

## 不在本次范围

- 不实现License生成、下载资源、OpenLab申请或任何外部系统调用。
- 不填充产品、文档、Marketplace、控制台和后台的正式业务内容。
- 不改变首页中文主标题和现有产品叙事结构。
- 不合并或推送Git分支，除非用户明确选择交付方式。

## 已验证来源

- Google Fonts：`https://fonts.google.com/specimen/Kaushan+Script`
- Google Fonts官方仓库：`https://github.com/google/fonts/tree/main/ofl/kaushanscript`
- 字体许可：`https://raw.githubusercontent.com/google/fonts/main/ofl/kaushanscript/OFL.txt`
