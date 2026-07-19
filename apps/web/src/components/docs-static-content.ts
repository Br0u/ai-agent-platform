/** Client-safe marketing copy retained for the legacy docs showcase. */
export const docsTechCapabilities = [
  {
    icon: "📄",
    title: "Markdown / MDX",
    description: "原生支持 Markdown 与 MDX，可在文档中嵌入 React 交互组件。",
  },
  {
    icon: "🔀",
    title: "多版本管理",
    description: "支持按产品版本切换文档快照，历史版本永久可回溯。",
  },
  {
    icon: "🔍",
    title: "全文检索",
    description: "基于 FlexSearch 的客户端即时搜索，毫秒级响应。",
  },
  {
    icon: "📊",
    title: "Mermaid 架构图",
    description: "内嵌 Mermaid 语法渲染流程图、时序图、架构图。",
  },
  {
    icon: "🔌",
    title: "OpenAPI 渲染",
    description: "自动解析 OpenAPI/Swagger 规范，生成可交互的接口文档。",
  },
  {
    icon: "🎨",
    title: "代码高亮",
    description: "支持 100+ 编程语言语法高亮，含行号、差异对比、一键复制。",
  },
  {
    icon: "📥",
    title: "PDF 导出",
    description: "一键将当前页面或整章内容导出为离线 PDF 文档。",
  },
  {
    icon: "🏗️",
    title: "企业级部署",
    description: "支持 SSG 静态生成与 SSR 服务端渲染，适配内网离线部署。",
  },
] as const;

export const docsCategories = [
  {
    code: "D1",
    slug: "quick-start",
    title: "快速开始",
    icon: "🚀",
    description: "从零到一的新手入门路径，快速完成平台部署与首次体验。",
    subCategories: [
      {
        id: "intro",
        title: "新手入门",
        description: "平台概览与核心概念说明，帮助您建立整体认知。",
        docs: [],
      },
      {
        id: "quick-deploy",
        title: "快速部署",
        description: "基于 Docker Compose 的单机最简部署，15 分钟内完成。",
        docs: [],
      },
      {
        id: "quick-experience",
        title: "快速体验",
        description: "创建第一个智能体并完成一次对话，验证平台核心能力。",
        docs: [],
      },
    ],
  },
  {
    code: "D2",
    slug: "deployment",
    title: "部署指南",
    icon: "🖥️",
    description: "覆盖单机到集群的全场景企业级部署方案，含离线与高可用架构。",
    subCategories: [
      {
        id: "standalone",
        title: "单机部署",
        description: "适用于 PoC 验证与小规模团队使用的单节点部署方案。",
        docs: [],
      },
      {
        id: "cluster",
        title: "集群部署",
        description: "基于 Kubernetes 的分布式集群部署，适用于生产环境。",
        docs: [],
      },
      {
        id: "offline",
        title: "离线部署",
        description: "无外网环境下的完整离线安装包与镜像导入指南。",
        docs: [],
      },
      {
        id: "ha",
        title: "HA 高可用部署",
        description: "多副本 + 负载均衡架构，保障 99.9% 可用性目标。",
        docs: [],
      },
    ],
  },
  {
    code: "D3",
    slug: "upgrade",
    title: "升级手册",
    icon: "⬆️",
    description: "版本迭代的安全升级路径，包含数据迁移与跨版本兼容性说明。",
    subCategories: [
      {
        id: "upgrade-steps",
        title: "版本升级步骤",
        description: "标准化的版本升级操作流程与检查清单。",
        docs: [],
      },
      {
        id: "data-migration",
        title: "数据迁移",
        description: "数据库 Schema 变更与数据迁移脚本使用说明。",
        docs: [],
      },
      {
        id: "version-compat",
        title: "跨版本兼容",
        description: "跨大版本升级的兼容性矩阵与已知问题说明。",
        docs: [],
      },
    ],
  },
  {
    code: "D4",
    slug: "operations",
    title: "运维手册",
    icon: "🔧",
    description: "生产环境日常运维操作指南，覆盖日志、故障排查与性能调优。",
    subCategories: [
      {
        id: "daily-ops",
        title: "日常运维",
        description: "备份恢复、证书续期、磁盘清理等常规维护操作。",
        docs: [],
      },
      {
        id: "logs",
        title: "日志查看",
        description: "各组件日志路径、日志级别调整与日志聚合方案。",
        docs: [],
      },
      {
        id: "troubleshooting",
        title: "故障排查",
        description: "常见故障现象、排查思路与应急恢复步骤。",
        docs: [],
      },
      {
        id: "performance",
        title: "性能调优",
        description: "推理吞吐、检索延迟、并发连接数等关键指标调优。",
        docs: [],
      },
    ],
  },
  {
    code: "D5",
    slug: "api",
    title: "API 文档",
    icon: "🔌",
    description: "全量 RESTful API 接口说明，含在线调试示例与错误码大全。",
    subCategories: [
      {
        id: "api-reference",
        title: "全量接口说明",
        description: "按模块分组的 API 端点列表，含请求/响应 Schema。",
        docs: [],
      },
      {
        id: "api-examples",
        title: "调试示例",
        description: "基于 cURL / Python SDK 的接口调用示例与最佳实践。",
        docs: [],
      },
      {
        id: "error-codes",
        title: "错误码",
        description: "全局错误码定义、HTTP 状态码映射与排障建议。",
        docs: [],
      },
    ],
  },
  {
    code: "D6",
    slug: "hardware",
    title: "硬件与 GPU 适配",
    icon: "🎮",
    description: "GPU 显卡适配列表、算力调优与驱动安装的完整参考。",
    subCategories: [
      {
        id: "gpu-compat",
        title: "显卡适配",
        description: "支持的 NVIDIA / AMD / 昇腾 GPU 型号与推荐配置。",
        docs: [],
      },
      {
        id: "compute-tuning",
        title: "算力调优",
        description: "GPU 显存分配、推理并发数与混合精度配置建议。",
        docs: [],
      },
      {
        id: "driver-install",
        title: "驱动安装",
        description: "CUDA、ROCm 等 GPU 驱动与运行时环境安装指南。",
        docs: [],
      },
    ],
  },
  {
    code: "D7",
    slug: "faq",
    title: "常见问题 FAQ",
    icon: "❓",
    description: "高频问题索引、典型报错解决方案与兼容性问题汇总。",
    subCategories: [
      {
        id: "faq-common",
        title: "高频问题",
        description: "安装部署、模型推理、知识库检索等场景的常见疑问解答。",
        docs: [],
      },
      {
        id: "error-solutions",
        title: "报错解决方案",
        description: "典型错误信息的原因分析与修复步骤索引。",
        docs: [],
      },
      {
        id: "compat-issues",
        title: "兼容问题汇总",
        description: "操作系统、浏览器、依赖组件的已知兼容性问题记录。",
        docs: [],
      },
    ],
  },
] as const;

export const docsLayoutSpec = {
  top: {
    title: "顶部全局区",
    features: ["全局搜索框", "文档版本切换", "语言切换"],
  },
  left: {
    title: "左侧导航区",
    features: ["树形目录导航（固定悬浮）"],
  },
  right: {
    title: "右侧正文区",
    features: [
      "正文渲染区",
      "目录锚点",
      "上一篇 / 下一篇",
      "代码复制",
      "PDF 导出",
      "问题反馈",
    ],
  },
} as const;
