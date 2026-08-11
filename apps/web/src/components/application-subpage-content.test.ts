import { describe, expect, it } from "vitest";

import {
  applicationSubpageSlugs,
  getApplicationSubpage,
} from "./application-subpage-content";

describe("prototype application subpage content contract", () => {
  it("registers exactly the three application subpages in source order", () => {
    expect(applicationSubpageSlugs).toStrictEqual([
      "app-writing",
      "app-bidding",
      "app-contract",
    ]);
    expect(getApplicationSubpage("unknown")).toBeUndefined();
  });

  it("locks the complete general writing page", () => {
    expect(getApplicationSubpage("app-writing")).toStrictEqual({
      slug: "app-writing",
      name: "通用文本写作",
      hero: {
        eyebrow: "行业应用中心｜通用文本写作",
        title: "通用文本写作：一句话起稿，AI 帮你写完全文",
        lead: "文案、汇报、方案、公文——输入主题或一句话，AI 先生成提纲、再分步成稿，你负责把关和定稿。告别从空白页开始。",
        tags: ["内容撰写", "润色改写", "总结提炼", "结构整理"],
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=通用文本写作咨询" },
        ],
        visual: {
          title: "写作工作台首页",
          note: "以项目组织写作任务：最近项目一键续写，随时新建",
        },
      },
      sections: [
        {
          id: "writing-challenges",
          eyebrow: "01｜三个核心问题",
          title: "办公文稿写作的三个核心问题",
          lead: "写材料最难的不是打字，而是搭结构、组织语言、保证规范——这三个问题，通用文本写作都有答案。",
          cards: [
            {
              number: "问题 01",
              title: "起稿怎么才能快？",
              description:
                "标题、结构、段落都要从零组织，一份材料反复斟酌，耗时数小时。",
              answer: "输入一句话，AI 先生成提纲与初稿，先有骨架再精修。",
              actions: [
                {
                  label: "了解通用文稿创作 →",
                  href: "/product/app-writing#writing-caps",
                },
              ],
            },
            {
              number: "问题 02",
              title: "行文怎么才规范？",
              description:
                "公文与办公材料对格式、措辞、行文逻辑要求严格，稍有偏差就要返工。",
              answer:
                "沉淀官方公文写作经验，大纲先行、分步生成，格式有据可依。",
              actions: [
                {
                  label: "了解公文撰写流程 →",
                  href: "/product/app-writing#writing-flow",
                },
              ],
            },
            {
              number: "问题 03",
              title: "校审怎么才省心？",
              description:
                "逐字核对格式、错别字、合规问题，费时费力，还容易出现疏漏。",
              answer:
                "上传文稿一键校审，自定义规则自动排查格式、措辞与合规问题。",
              actions: [
                {
                  label: "了解智能公文校审 →",
                  href: "/product/app-writing#writing-trace",
                },
              ],
            },
          ],
        },
        {
          id: "writing-overview",
          eyebrow: "02｜它是什么",
          title: "兼顾通用写作与专业公文写作的一体化文稿服务",
          lead: "华鲲 AI 写作助手：既满足日常文字创作，更深耕机关、企事业单位办公场景，覆盖文稿撰写、审核全流程。",
          cards: [
            {
              title: "通用文稿创作",
              description:
                "文案撰写、润色改写、内容提炼，满足日常文字需求，让创作更高效。",
              actions: [
                {
                  label: "了解通用写作能力 →",
                  href: "/product/app-writing#writing-caps",
                },
              ],
            },
            {
              title: "全品类公文撰写",
              description:
                "覆盖国标法定公文与办公材料，支持大纲先行、分步生成全文，行文有章法。",
              actions: [
                {
                  label: "了解写作工作流 →",
                  href: "/product/app-writing#writing-flow",
                },
              ],
            },
            {
              title: "智能公文校审",
              description:
                "上传文稿一键校审，可自定义校审规则，自动排查格式、措辞与合规问题。",
              actions: [
                {
                  label: "了解有据可溯 →",
                  href: "/product/app-writing#writing-trace",
                },
              ],
            },
          ],
          visual: "写作工作台全景",
          note: "写作工作台：左侧接入写作来源与知识库，右侧对话成稿，全程可引用、可追溯。",
        },
        {
          id: "writing-flow",
          eyebrow: "03｜怎么用：从一句话到成稿",
          title: "输入要求，AI 帮你完成一份材料的全流程",
          lead: "对话式写作与大纲先行两种方式，都能把写作拆成可确认的步骤，边写边改、随时接管。",
          flow: ["输入要求", "生成提纲", "分步成稿", "润色定稿"],
          cards: [
            {
              number: "STEP 01",
              title: "输入要求",
              description:
                "一句话描述要写什么、给谁看，或直接在对话中提出，AI 会先理解写作意图。",
              visual: "对话式写作",
            },
            {
              number: "STEP 02",
              title: "生成提纲",
              description:
                "AI 先搭结构与要点，你确认方向后再继续，避免写到一半跑偏。",
              visual: "生成大纲",
            },
            {
              number: "STEP 03",
              title: "分步成稿",
              description:
                "按提纲分步生成全文，可引用上传的文件与知识库，内容有出处。",
              visual: "生成结果与引用",
            },
            {
              number: "STEP 04",
              title: "润色定稿",
              description:
                "扩写、简写、改写、续写，统一格式与措辞，编辑确认后定稿。",
              visual: "通用写作编辑器",
            },
          ],
        },
        {
          id: "writing-caps",
          eyebrow: "04｜通用写作的四大能力",
          title: "围绕一篇稿子的完整写作能力",
          lead: "同一篇稿子，可以组合多种处理任务：先撰写，再提炼、润色、整理，直到满意为止。",
          cards: [
            {
              title: "内容撰写",
              description:
                "围绕主题创作完整文字内容，清晰传递信息与核心观点，成稿有逻辑。",
            },
            {
              title: "总结提炼",
              description:
                "从长文中抓取核心信息，精简概括，突出重点与关键观点，方便复用。",
            },
            {
              title: "润色优化",
              description:
                "对文案精修打磨，统一语气与表达，提升可读性与专业度。",
            },
            {
              title: "结构整理",
              description:
                "梳理内容逻辑，搭建清晰框架，让层次分明、更易阅读与审阅。",
            },
          ],
          visual: "通用写作任务面板",
          note: "一次写作可组合多种处理任务：撰写、提炼、润色、整理",
        },
        {
          id: "writing-trace",
          eyebrow: "05｜写作有据、稿子不丢",
          title: "参考可引用，历史可续写",
          lead: "写作不是一次性动作：过程中引用有依据，完成后草稿还能继续改。",
          cards: [
            {
              title: "参考文件与知识库",
              description:
                "上传 PDF、Word 等参考文件，或引用知识库，生成内容标注来源、可查看引用，保证有据可依。",
              visual: "提示和来源",
            },
            {
              title: "历史版本与续写",
              description:
                "文稿按版本沉淀，历史记录随时找回；未完成的稿子可随时打开继续编辑，思路不中断。",
              visual: "历史记录",
            },
          ],
        },
      ],
      business: {
        eyebrow: "06｜业务场景",
        title: "让每一次写作，都有 AI 先出稿",
        lead: "输入一句话，AI 搭提纲、写初稿、给依据，你只负责把关和定稿。",
        points: [
          {
            title: "一句话起稿",
            description: "不用从空白页开始，先有骨架再精修",
          },
          { title: "大纲先行", description: "结构与要点先确认，方向不跑偏" },
          {
            title: "有据可溯",
            description: "引用文件与知识库，生成内容有出处",
          },
          { title: "一键润色", description: "扩写、简写、改写、续写随时可用" },
        ],
        values: [
          {
            title: "写得更快",
            description: "提纲到成稿分步完成，缩短起稿时间",
          },
          {
            title: "行文更规范",
            description: "沉淀公文写作经验，格式措辞有依据",
          },
          { title: "审核更省心", description: "可一键校审，降低人工核对成本" },
        ],
        demo: {
          title: "通用文本写作助手",
          messages: [
            { role: "user", text: "写一份关于开展公文写作培训的通知" },
            { role: "assistant", text: "正在生成文章大纲……" },
            {
              role: "assistant",
              text: "已生成大纲：一、总体要求；二、培训时间与地点；三、参训人员；四、培训内容。",
            },
            { role: "assistant", text: "来源：公文写作经验库" },
            { role: "user", text: "按大纲生成全文，语气正式一些" },
            { role: "assistant", text: "正在分步生成全文……" },
            {
              role: "assistant",
              text: "已生成全文初稿，可继续扩写、简写或改写后定稿。",
            },
            { role: "assistant", text: "参考：已上传 5 份相关文件" },
          ],
          footer: { placeholder: "请输入你的写作要求…", action: "发送" },
          note: "一句话 → 生成大纲 → 分步成稿 → 润色定稿",
        },
        reason: ["大模型生成", "公文写作经验", "参考文件引用", "校审规则校验"],
        workflowLabel: "写作工作流",
        workflow: ["输入要求", "生成大纲", "分步成稿", "润色定稿"],
        outcomes: [
          {
            title: "写得更快",
            description: "提纲到成稿分步完成，缩短起稿时间",
          },
          { title: "行文更规范", description: "格式、措辞、逻辑有据可依" },
          { title: "审核更省心", description: "一键校审，降低人工核对成本" },
        ],
        scenesLead: "覆盖通知、报告、方案、纪要、宣传文案等高频写作场景。",
        scenes: [
          {
            title: "公文与通知写作",
            description: "通知、报告、通报等法定公文与办公材料。",
            actions: [
              { label: "查看文档智能方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
          {
            title: "汇报与总结",
            description: "工作汇报、会议纪要、总结材料快速成稿。",
            actions: [
              { label: "查看相关方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
          {
            title: "宣传与文案",
            description: "企业宣传稿、活动文案、日常内容的创作与润色。",
            actions: [
              { label: "查看相关方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
        ],
      },
      cta: {
        title: "下一次写材料，先让 AI 出稿",
        description: "申请体验通用文本写作，或与华鲲团队沟通企业级部署。",
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=通用文本写作咨询" },
          { label: "返回行业应用中心", href: "/product/applications" },
        ],
      },
    });
  });

  it("locks the complete bidding assistant page", () => {
    expect(getApplicationSubpage("app-bidding")).toStrictEqual({
      slug: "app-bidding",
      name: "投标智能助手",
      hero: {
        eyebrow: "行业应用中心｜投标智能助手",
        title: "投标智能助手：把投标从「加班赶」变成「有条理」",
        lead: "上传招标文件，AI 智能解析需求、拆解评分点、生成大纲、分章撰写标书，查漏核对一键完成。团队把精力留给方案本身。",
        tags: ["智能解读", "大纲先行", "全文撰写", "合规审查"],
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=投标智能助手咨询" },
        ],
        visual: {
          title: "投标项目首页",
          note: "以项目组织投标任务：章节进度、字数与状态一目了然，随时新建",
        },
      },
      sections: [
        {
          id: "bidding-challenges",
          eyebrow: "01｜三个核心问题",
          title: "投标提效的三个核心问题",
          lead: "标书研读、撰写、核对占去投标周期的大半时间——这三件事，投标智能助手都有答案。",
          cards: [
            {
              number: "问题 01",
              title: "标书怎么读懂？",
              description:
                "招标文件动辄上百页，资质门槛、评分标准、技术参数需逐条人工梳理。",
              answer:
                "AI 智能解析，自动提取项目需求、资质门槛、评分标准、技术参数与商务条款。",
            },
            {
              number: "问题 02",
              title: "标书怎么写准？",
              description:
                "标书章节多、体量大，依赖复制粘贴历史资料，难以逐条对应评分点。",
              answer:
                "按评分结构生成大纲，分章精准编写，基于企业资料库生成初稿。",
            },
            {
              number: "问题 03",
              title: "查漏怎么防漏？",
              description:
                "交标前逐条检查遗漏、格式与合规问题，费时费力，还容易出现疏漏。",
              answer:
                "智能识别风险、遗漏项与得分关键点，招投标文件合规性一键审查。",
            },
          ],
        },
        {
          id: "bidding-overview",
          eyebrow: "02｜它是什么",
          title: "覆盖投标全流程的智能标书助手",
          lead: "依托智能解析技术，深度研读投标文件，让投标全流程更智能、高效、稳妥。",
          cards: [
            {
              title: "智能解读标书",
              description:
                "解析项目需求、资质门槛、评分标准、技术参数与商务条款，自动梳理响应要点。",
              actions: [
                {
                  label: "了解投标全流程 →",
                  href: "/product/app-bidding#bidding-workflow",
                },
              ],
            },
            {
              title: "大纲与全文撰写",
              description:
                "按评分结构生成章节与要点，分章精准编写，支持插入表格、图片与自定义重编。",
              actions: [
                {
                  label: "了解撰写能力 →",
                  href: "/product/app-bidding#bidding-caps",
                },
              ],
            },
            {
              title: "合规性智能审查",
              description:
                "识别潜在风险、遗漏项与得分关键点，格式与合规问题自动排查，交标更稳妥。",
              actions: [
                {
                  label: "了解质量保障 →",
                  href: "/product/app-bidding#bidding-trace",
                },
              ],
            },
          ],
          visual: "投标智能助手工作台",
          note: "投标工作台：上传招标文件、智能提取核心信息、引用参考来源，右侧对话式完成解读与应答",
        },
        {
          id: "bidding-workflow",
          eyebrow: "03｜怎么用：投标全流程",
          title: "从拿到标书到封装，每一步都有 AI 帮",
          lead: "把投标拆成可确认的步骤：先读懂标书，再搭好结构，最后逐章成稿、审查交付。",
          flow: ["上传标书", "智能解析", "生成大纲", "分章撰写", "审查下载"],
          cards: [
            {
              title: "先搭大纲，结构对照评分点。",
              description:
                "AI 按评分办法生成章节与要点，预估字数与页数，章节可增删调整，编写思路清晰可见。",
              points: [
                "大纲先行：章节树可增删，预估字数页数，对照评分点与编写思路",
              ],
              visual: "生成大纲",
            },
            {
              title: "再分章撰写，进度与格式可控。",
              description:
                "章节级精准编写，支持插入表格与图片、正文与目录格式规范，待编写/已完成进度一目了然。",
              points: [
                "分章撰写：章节管理、精准编写、插入表格图片、一键生成全文",
              ],
              visual: "正文格式",
            },
          ],
        },
        {
          id: "bidding-caps",
          eyebrow: "04｜能力优势与质量保障",
          title: "从能力到保障，投标全程可控",
          lead: "每一个环节都有对应能力支撑；内容有出处、版本可回溯，交付有保障。",
          cards: [
            {
              tag: "核心能力",
              title: "智能解读标书",
              description:
                "一键解析招标文件，精准抓取项目需求、资质门槛、评分标准与技术参数。",
            },
            {
              title: "大纲先行",
              description:
                "按评分结构生成章节，预估字数页数，章节可增删，编写思路清晰。",
            },
            {
              title: "分章撰写",
              description:
                "章节级精准编写，插入表格与图片，待编写/已完成进度可视。",
            },
            {
              title: "格式与审查",
              description:
                "正文与目录格式规范，合规性、响应完整性自动核对，交标更稳妥。",
            },
          ],
          groups: [
            {
              id: "bidding-trace",
              title: "质量保障",
              cards: [
                {
                  title: "参考来源与知识库",
                  description:
                    "历史资料、网络搜索与知识库均可作为撰写依据，内容来源清晰可查，保证标书有据可依。",
                },
                {
                  title: "生成记录与历史版本",
                  description:
                    "生成记录全程留存，历史版本可回溯，支持重新生成与下载交付，过程可追溯。",
                },
              ],
            },
          ],
        },
      ],
      business: {
        eyebrow: "05｜业务场景",
        title: "让投标团队，把精力留给方案",
        lead: "上传一份标书，AI 完成解读、拆点、列纲、成稿与查漏，你只负责把关。",
        points: [
          {
            title: "智能解读",
            description: "自动提取需求、资质、评分与技术参数",
          },
          { title: "大纲先行", description: "对照评分点生成章节，方向不偏" },
          { title: "分章撰写", description: "章节级成稿，表格图片可插入" },
          { title: "查漏核对", description: "风险、遗漏与得分点自动识别" },
        ],
        values: [
          { title: "研读更快", description: "标书要点自动拆解，缩短研读时间" },
          { title: "响应更准", description: "逐条对应评分点，标书有的放矢" },
          { title: "交标更稳", description: "遗漏与合规问题提前发现" },
        ],
        demo: {
          title: "智能投标助手",
          messages: [
            {
              role: "user",
              text: "已上传「鲲鹏服务器采购项目」招标文件，帮我梳理应标要点",
            },
            { role: "assistant", text: "正在智能解析招标文件……" },
            {
              role: "assistant",
              text: "已提取项目需求、资质门槛、评分标准与技术参数，识别 3 个得分关键点与 2 处潜在风险。",
            },
            { role: "assistant", text: "来源：招标文件智能解析" },
            { role: "user", text: "按评分结构生成标书大纲" },
            {
              role: "assistant",
              text: "已生成 8 个章节大纲，预计约 122 页，可逐章撰写、随时调整。",
            },
            { role: "assistant", text: "对照：评标办法评分点" },
          ],
          footer: { placeholder: "请输入你的问题…", action: "发送" },
          note: "上传标书 → 智能解析 → 生成大纲 → 分章撰写 → 审查交付",
        },
        reason: ["智能解析", "需求提炼", "大纲生成", "全文撰写", "合规审查"],
        workflowLabel: "投标工作流",
        workflow: ["上传标书", "智能解析", "生成大纲", "分章撰写", "审查下载"],
        outcomes: [
          { title: "研读更快", description: "标书要点自动拆解，缩短研读时间" },
          { title: "响应更准", description: "逐条对应评分点，标书有的放矢" },
          { title: "交标更稳", description: "遗漏与合规问题提前发现" },
        ],
        scenesLead:
          "覆盖政企招投标、系统集成与设备采购、方案类投标等标书编写场景。",
        scenes: [
          {
            title: "政企招投标项目",
            description: "政府采购、行业入围类标书快速响应。",
            actions: [
              { label: "查看文档智能方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
          {
            title: "系统集成与设备采购",
            description: "技术方案、商务应答分章编写。",
            actions: [
              { label: "查看相关方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
          {
            title: "方案类投标",
            description: "咨询与集成方案类标书高效成稿。",
            actions: [
              { label: "查看相关方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
        ],
      },
      cta: {
        title: "下次投标，让团队更有条理",
        description: "申请体验投标智能助手，或与华鲲团队沟通投标场景方案。",
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=投标智能助手咨询" },
          { label: "返回行业应用中心", href: "/product/applications" },
        ],
      },
    });
  });

  it("locks the complete contract review page", () => {
    expect(getApplicationSubpage("app-contract")).toStrictEqual({
      slug: "app-contract",
      name: "合同智能审查",
      hero: {
        eyebrow: "行业应用中心｜合同智能审查",
        title: "合同智能审查：条款逐条核对，风险早发现",
        lead: "长合同条款多、规则细、靠人盯。上传合同、选择审查清单，AI 先完成条款核对与风险标注，审核人只做复核定案。",
        tags: ["条款审查", "风险标注", "清单可配", "复核闭环"],
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=合同智能审查咨询" },
        ],
        visual: {
          title: "合同审查项目首页",
          note: "以项目组织审查任务：最近项目一键续查，随时新建",
        },
      },
      sections: [
        {
          id: "contract-challenges",
          eyebrow: "01｜三个核心问题",
          title: "合同审查的三个核心问题",
          lead: "合同越长、条款越细，审查越容易漏——这三个问题，合同智能审查都有答案。",
          cards: [
            {
              number: "问题 01",
              title: "条款怎么核得全？",
              description:
                "长合同条款多、规则细，靠人工逐条核对，容易遗漏关键风险点。",
              answer: "按审查清单逐条核对，自动识别并标注风险条款。",
            },
            {
              number: "问题 02",
              title: "尺度怎么统一？",
              description:
                "不同人、不同清单、不同立场，审查口径不一致，结论难对比。",
              answer: "预置多类合同审查清单，审查尺度与立场可配置，口径统一。",
            },
            {
              number: "问题 03",
              title: "风险怎么早发现？",
              description:
                "风险点发现晚、定位难，人工复核费时费力，交付周期长。",
              answer: "风险分级标注、条款精准定位，审核人聚焦复核定案。",
            },
          ],
        },
        {
          id: "contract-overview",
          eyebrow: "02｜它是什么",
          title: "面向合同审核人的智能审查助手",
          lead: "把长合同拆成可核对的条款与风险点，让 AI 完成初查、人工负责定案。",
          cards: [
            {
              title: "智能条款审查",
              description: "按审查清单逐条核对合同条款，自动识别并标注风险点。",
              actions: [
                {
                  label: "了解审查全流程 →",
                  href: "/product/app-contract#contract-workflow",
                },
              ],
            },
            {
              title: "审查要求灵活",
              description: "预置多类合同清单，审查尺度与立场可设置，口径统一。",
              actions: [
                {
                  label: "了解审查能力 →",
                  href: "/product/app-contract#contract-caps",
                },
              ],
            },
            {
              title: "审查结果可复核",
              description: "风险分级呈现、条款精准定位，逐条审阅、过程可追溯。",
              actions: [
                {
                  label: "了解质量保障 →",
                  href: "/product/app-contract#contract-trace",
                },
              ],
            },
          ],
          visual: "合同审查结果详情",
          note: "审查结果详情：风险分级（常规/次要/重要），逐条审阅、条款定位",
        },
        {
          id: "contract-workflow",
          eyebrow: "03｜怎么用：审查全流程",
          title: "从上传合同到风险审阅，一条闭环",
          lead: "把审查拆成可确认的步骤：先建项目、传合同，再选清单、定尺度，最后审阅风险、复核定案。",
          flow: ["新建项目", "上传合同", "选择审查清单", "AI 审查", "风险审阅"],
          cards: [
            {
              title: "对话式审查，边问边查。",
              description:
                "上传合同后，通过对话指定审查清单与立场（如「按保理合同审核标准，作为保理商严格审查」），AI 即按口径执行。",
              points: ["上传合同 + 引用知识库，对话式发起审查"],
              visual: "合同审查对话",
            },
            {
              title: "审查要求可配置。",
              description:
                "选择审查清单（商务/销售/保理/技术/租赁/采购/通用合同），设置审查尺度（强势/中立/弱势）与立场，还可对比、翻译与优化。",
              points: ["审查清单 + 审查尺度 + 审查立场，口径可配"],
              visual: "审查要求设置",
            },
          ],
        },
        {
          id: "contract-caps",
          eyebrow: "04｜能力优势与质量保障",
          title: "从清单到结论，审查有据可复核",
          lead: "每一个环节都有对应能力支撑；审查口径可配置，过程可留痕，结论有依据。",
          cards: [
            {
              tag: "核心能力",
              title: "预置审查清单",
              description:
                "商务、销售、保理、技术、租赁、采购、通用等多类合同清单，条款与风险点内置。",
            },
            {
              title: "对话式审查",
              description:
                "上传合同即可对话发起审查，指定清单与立场，AI 按口径执行。",
            },
            {
              title: "风险分级标注",
              description:
                "常规 / 次要 / 重要风险分级呈现，条款精准定位，逐条审阅。",
            },
            {
              title: "附加能力",
              description:
                "合同对比、合同翻译（中/英/日）、内容优化，覆盖更多工作场景。",
            },
          ],
          groups: [
            {
              id: "contract-trace",
              title: "质量保障",
              lead: "审查清单：预置清单内含条款说明与风险点，审查口径有据可依",
              cards: [
                {
                  title: "审查尺度与立场",
                  description:
                    "支持强势、中立、弱势审查尺度与审查立场设置，审查口径统一、结论可对比。",
                },
                {
                  title: "过程与结论可追溯",
                  description:
                    "审查清单来源、条款风险点与逐条审阅记录全程留存，结论可复核、可回溯。",
                },
              ],
              visual: "审查清单",
            },
          ],
        },
      ],
      business: {
        eyebrow: "05｜业务场景",
        title: "让合同审查更快、更稳",
        lead: "上传一份合同，AI 完成条款核对与风险标注，你只负责复核定案。",
        points: [
          { title: "条款逐条核对", description: "按审查清单逐条比对，不遗漏" },
          { title: "风险分级标注", description: "常规/次要/重要风险一目了然" },
          { title: "口径可配置", description: "清单、尺度、立场按需设置" },
          { title: "结论可追溯", description: "审查过程留痕，复核有据" },
        ],
        values: [
          { title: "查得更全", description: "条款与风险点逐条覆盖" },
          { title: "口径更统一", description: "清单与尺度可配置" },
          { title: "交付更稳", description: "风险分级、复核闭环" },
        ],
        demo: {
          title: "合同智能审查助手",
          messages: [
            {
              role: "user",
              text: "已上传保理合同，请按保理合同审核标准，作为保理商严格审查",
            },
            { role: "assistant", text: "正在逐条核对合同条款……" },
            {
              role: "assistant",
              text: "已按保理合同清单完成审查，检测 19 处合同风险：常规 4 处、次要 12 处、重要 3 处。",
            },
            {
              role: "assistant",
              text: "审查清单：保理合同 · 审查尺度：强势",
            },
            { role: "user", text: "重点标出重要风险，定位到条款" },
            {
              role: "assistant",
              text: "重要风险已标注并定位：违约金上限过低、生效条件不确定、回购义务缺失。",
            },
            {
              role: "assistant",
              text: "条款定位：违约处理条款 / 合同生效条款 / 回购义务条款",
            },
          ],
          footer: { placeholder: "请输入你的审查问题…", action: "发送" },
          note: "上传合同 → 选择清单 → AI 审查 → 风险审阅 → 复核定案",
        },
        reason: ["条款解析", "清单核对", "风险标注", "人工复核"],
        workflowLabel: "审查工作流",
        workflow: ["上传合同", "选择清单", "AI 审查", "风险审阅"],
        outcomes: [
          { title: "查得更全", description: "条款与风险点逐条覆盖" },
          { title: "口径更统一", description: "清单与尺度可配置" },
          { title: "交付更稳", description: "风险分级、复核闭环" },
        ],
        scenesLead: "覆盖金融保理、采购销售、劳务租赁等各类合同审查场景。",
        scenes: [
          {
            title: "金融与保理合同",
            description: "保理、租赁等金融合同按标准严格审查。",
            actions: [
              { label: "查看文档智能方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
          {
            title: "采购与销售合同",
            description: "商务、采购、销售合同风险核查与条款优化。",
            actions: [
              { label: "查看相关方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
          {
            title: "劳务与租赁合同",
            description: "劳务、租赁等合同条款合规性核查。",
            actions: [
              { label: "查看相关方案 →", href: "/solutions#knowledge" },
              { label: "查看实践案例 →", href: "/cases" },
            ],
          },
        ],
      },
      cta: {
        title: "让合同审查更快、更稳",
        description: "申请体验合同智能审查，或与华鲲团队沟通合规审查方案。",
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=合同智能审查咨询" },
          { label: "返回行业应用中心", href: "/product/applications" },
        ],
      },
    });
  });
});
