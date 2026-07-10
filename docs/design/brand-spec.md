# 华鲲元启 · Brand Spec

> Captured: 2026-07-10
> Source: 用户提供的两份产品彩页、本地PRD、华为鲲鹏伙伴页
> Completeness: partial / source-backed

## 当前资产策略

两份彩页已提供Logo、平台UI截图、视觉检索UI截图和设备图。当前可用于设计参考与内部原型；正式上线前仍需独立、可授权的原始素材文件。

## 核心素材

### Logo

- 彩页中存在“华鲲振宇”和“华鲲元启”Logo。
- 当前缺少独立SVG、透明PNG及深色背景反白版。
- 当前裁切占位：`docs/design/assets/huakun-yuanqi/wordmark.png`。
- 页面使用副本：`apps/web/src/assets/huakun-yuanqi/wordmark.png`，已提供“华鲲元启”替代文本。
- 设计方向稿和当前页面可使用文字标识或彩页裁切图；生产上线前必须替换为授权原文件，不得重绘假Logo。

### 产品截图

- 平台彩页提供：首页、知识库、语料处理、知识图谱、MCP、训练与部署界面。
- 视觉检索彩页提供：任务中心、即时检索、持续布控、算法配置与预警管理界面。
- 首页主叙事优先使用华鲲元启平台UI；视觉检索截图只用于行业方案或多模态能力章节。
- 当前平台界面占位：`docs/design/assets/huakun-yuanqi/platform-overview.png`。
- 首页使用截图：`apps/web/src/assets/huakun-yuanqi/platform-overview.png`，由用户单独提供，展示应用广场，并提供“华鲲元启应用广场界面”替代文本。
- 该截图可见账号名`wuboru`及界面时间；公开发布前需确认是否保留。

### 产品设备图

- 视觉检索彩页提供AT9508 G3与AT3500 G3设备图。
- 设备图只用于视觉检索一体化方案详情，不作为华鲲元启平台首页唯一主体。

## 色彩系统

- Blue / Primary: `#3A67B1`
- Cyan / Product signal: `#56C0F8`
- Indigo / Structural: `#4C91EB`
- Violet / Selective accent: `#9277DC`
- Corporate red / Brand seal: `#D91F26`
- Ink: `#101838`
- Muted ink: `#566078`
- Canvas: `#F7F8FB`
- Surface: `#FFFFFF`
- Dark canvas: `#101838`

使用规则：蓝色承担主操作，深靛承担结构，紫色只用于模型/智能状态；红色只对应华鲲振宇母品牌标识或高风险状态。蓝紫连续色只可用于细窄品牌光谱或真实产品截图，不做大面积装饰背景。

## 字体系统

- Header brand：`Kaushan Script`，仅用于顶部`AI Agent Platform`主标题；来自Google Fonts官方仓库，通过`next/font/local`自托管。
- Display：正式字体未提供；方向稿需选择具有工业感的中文黑体，不继续使用通用SaaS式大圆体。
- Body：正式字体未提供；中文正文优先保证清晰、紧凑和企业文档感。
- Mono：用于模型名、接口、版本与技术标签。

`Kaushan Script`使用SIL Open Font License 1.1，字体与许可文件位于`apps/web/src/assets/fonts/kaushan-script/`。正式中文品牌字体仍未提供。

## 气质关键词

- 国产算力底座
- 企业级私有化
- 工业精确
- 产品界面优先
- 克制但有计算感

## 缺失项

- 独立Logo源文件与反白版
- 原始分辨率产品UI截图
- 可直接用于Web的设备透明图
- 正式中文字体与字体授权说明
- 完整品牌规范或Figma设计系统

缺失项继续使用明确占位；彩页截图不能被当作长期生产素材来源。

## 当前实现状态

- 已完成企业决策者优先的首页、品牌化全局导航和统一占位页面。
- 视觉检索只出现在行业方案索引内，并明确标注为“基于华鲲元启的行业子能力”。
- 已通过1440×1000和390×844真实浏览器验收，页面无横向溢出，交互目标最小44px。
- 本地图片均成功加载；开发模式控制台0错误、0警告。
