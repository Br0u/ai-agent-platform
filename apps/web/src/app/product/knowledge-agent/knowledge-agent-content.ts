export const knowledgeAgentIntro = {
  title: "华鲲元启智能导办一体机",
  painPoint: "传统模式下，个体工商户业务办理申请人常因材料格式不对、经营范围表述不规范、身份信息与地址信息不一致等问题，反复修改材料，通过调研发现，约60%的申请人会因材料问题至少跑两趟，“材料不合格、白跑一趟”成为创业者反映最集中的痛点。",
  solution: "华鲲元启智能导办一体机以 AI 赋能，实现智能问答、材料信息提取、表单键生成及 AI 辅助审核等业务全流程的智能化升级，有效提升了个体工商户业务办理的一次性成功率，让政务服务从“群众适应流程”转变为“流程适应群众”。",
};

export const workflowSteps = [
  {
    title: "AI 问答精准筛选业务场景",
    description: "个体工商户业务涉及内地居民、港澳台同胞、个体经营、家庭经营、注册登记、变更和注销等最多 27 个不同场景；智能导办通过 AI 问答，最多通过 4 个问题即可帮助申请者精准定位办事意图。"
  },
  {
    title: "情形智能引导，材料上传固化",
    description: "通过判断出申请者的具体场景，将办理所需的材料固化，并且给出各种材料的上传说明和示意图，让用户一次性上传好办理业务所需的所有材料。"
  },
  {
    title: "材料智能识别，信息自动提取",
    description: "通过华鲲元启的 OCR 能力自动对上传的各类材料进行内容提取，并利用大模型理解识别后自动提取填写到申请表中，避免关键信息填错、漏填，准确率可达 96% 以上。"
  },
  {
    title: "AI 辅助进行审核，大幅提升一次性成功率",
    description: "注册提交后，通过 AI 进行业务审核，最快 1-2 分钟审核完成，即刻反馈用户业务申请的审核结果。"
  }
];

export const productFeatures = [
  { title: "智能问答", desc: "个体工商户业务的全流程智能问答" },
  { title: "最小场景", desc: "将个体工商户业务细分为27个最小颗粒度的场景" },
  { title: "场景判定", desc: "引导式问答帮助用户确定业务办理场景" },
  { title: "材料固化", desc: "基于业务办理场景固化用户上传的材料类型" },
  { title: "材料识别", desc: "通过 OCR 和 LLM 自动识别材料内容" },
  { title: "智能填表", desc: "基于上传材料提取内容，智能填写申请表" },
  { title: "AI 起名", desc: "通过 AI 帮助申请者给个体工商户起名" },
  { title: "规则校验", desc: "提供名称查重、地址规范校验、经营范围校验、禁限词校验等多种规则自动校验" },
  { title: "智能审核", desc: "提供 AI 业务申请审核，并给出审核问题点" }
];

export const targetUnits = [
  { name: "市场监督管理局", icon: "🏛️" },
  { name: "行政审批局", icon: "📑" },
  { name: "代办机构", icon: "🤝" }
];

export const hardwareConfigs = {
  columns: ["产品形态", "产品描述"],
  rows: [
    {
      form: "全国产化\n最佳性能\n一体机方案",
      desc: "HuaKun AT3500 G3 (64G)\nCPU: 4*48核\nNPU: 2.2P@FP16 512G显存\n内存: 32*32GB DIMM\n系统盘: 2*480GB, 数据盘: 2*3.84 TB NVMe",
      highlight: true
    },
    {
      form: "全国产化\n最佳性价比\n一体机方案",
      desc: "HuaKun AT9508 G3\n+ 6 * Atlas 300I A2 (64G)\nCPU: 2*48核\nNPU: 6 * Atlas 300I A2 (64G)\n内存: 32*32GB DIMM\n系统盘: 2*480GB, 数据盘: 2*3.84 TB NVMe",
      highlight: false
    },
    {
      form: "元启-行业智能体",
      desc: "智能导办智能体",
      highlight: false
    },
    {
      form: "安装实施服务",
      desc: "华鲲元启平台安装部署、功能验证、配置模型部署",
      highlight: false
    }
  ]
};
