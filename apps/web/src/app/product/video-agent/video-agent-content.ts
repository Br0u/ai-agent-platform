export const videoAgentIntro = {
  title: "华鲲元启视觉检索一体机",
  description:
    "依托全国产化算力底座与多模态大模型，通过华鲲元启 AI 开发平台，打造行业视频检索智能体一体化解决方案。设备支持离线视频文件检索与摄像头实时分析，仅需简单自然语言指令，即可完成特定场景的检索与预警，涵盖实时布控、即时查找两种模式，实现精准识人、识物、识行为，可广泛应用于安防、应急、城市治理、交通等众多行业领域。",
};

export const vsComparison = {
  traditional: {
    title: "传统小模型",
    items: [
      { label: "周期长", desc: "1周-1个月" },
      { label: "泛化差", desc: "需重新训练" },
      { label: "局部特征", desc: "难以理解全局" },
    ],
    footer: "适合场景单一，摄像头多",
  },
  largeModel: {
    title: "视觉大模型",
    items: [
      { label: "分钟级创建", desc: "即刻生效" },
      { label: "零样本训练", desc: "自然语言交互" },
      { label: "全局语义", desc: "懂人、懂物、懂场景" },
    ],
    footer: "适合场景多，利旧摄像头",
  },
};

export const coreFeatures = [
  {
    title: "2000+维度全解析，零定制、快响应",
    items: [
      "不止“看见”，更能像人一样“读懂”人/事/物/行为/场景",
      "单个图像/向量化解析高达2000+维度，细节无遗漏",
      "覆盖公安、环保、城市治理、能源等多行业的视频检索场景",
    ],
  },
  {
    title: "全流程自然语言交互，支持多场景叠加",
    items: [
      "自然语言交互式的视觉检索，实现即时查找",
      "通过自然语言进行算法配置，实现实时布控",
      "支持离线视频文件上传和摄像头实时视频流解析",
    ],
  },
  {
    title: "上线快，满足泛化场景的多种需求，高性价比",
    items: [
      "搭载零样本生成算法，不依赖样本训练，无等待训练周期",
      "可利旧原有摄像头，无需升级智能摄像头",
    ],
  },
];

export const applicationScenarios = [
  "公共安全",
  "道路交通",
  "应急管理",
  "城市管理",
  "安全生产",
  "环保水利",
  "消防监测",
  "更多泛化场景...",
];

export const hardwareConfig = {
  modelName: "HuaKun AT3500 G3 (64G)",
  coreComponents: "视觉大模型 (43B) + 华鲲元启AI平台 + 行业视频智能体",
  tableData: [
    {
      category: "HuaKun\nAT3500 G3\n(64G)",
      details: [
        "CPU: 4*48核",
        "NPU: 2.2P@FP16 512G显存",
        "内存: 32*32GB DIMM",
        "系统盘: 2*960GB, 数据盘: 6*7.68 TB NVMe",
      ],
    },
    { category: "元启-商业版", details: ["华鲲元启AI开发平台 (商业版)"] },
    { category: "元启-增值包", details: ["视频解析增强包 (3路授权)"] },
    { category: "元启-行业智能体", details: ["行业视频智能体"] },
    { category: "超融合软件", details: ["TGHCI 超融合系统虚拟化软件"] },
    {
      category: "安装实施服务",
      details: ["华鲲元启平台安装部署、功能验证、配置模型部署"],
    },
  ],
};
