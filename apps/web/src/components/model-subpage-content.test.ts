import { describe, expect, it } from "vitest";

import { getModelSubpage, modelSubpageSlugs } from "./model-subpage-content";

const pageContracts = [
  [
    "model-optimization",
    "模型优化：数据、训练、评估，让模型更懂业务",
    3,
    0,
    true,
  ],
  ["model-task-center", "任务中心：模型任务统一管理", 6, 4, true],
  ["model-assets", "模型资产管理：让企业模型资产一条线管到底", 4, 3, true],
  ["model-training", "模型训练：让模型更贴合你的业务", 6, 4, true],
  ["model-evaluation", "模型评估：效果好不好，用数据说话", 5, 3, false],
  ["model-data", "数据准备：训练效果从数据开始", 3, 0, true],
  ["model-deploy", "模型部署：让模型变成可调用的服务", 4, 0, true],
] as const;

describe("prototype model subpage content contract", () => {
  it("registers exactly the seven model subpages", () => {
    expect(modelSubpageSlugs).toStrictEqual(
      pageContracts.map(([slug]) => slug),
    );
    expect(getModelSubpage("unknown")).toBeUndefined();
  });

  it.each(pageContracts)(
    "locks the %s structure",
    (slug, title, sectionCount, demoCount, hasCta) => {
      const page = getModelSubpage(slug);
      const sectionDemoCount =
        page?.sections.filter((section) => section.demo).length ?? 0;

      expect(page?.hero.title).toBe(title);
      expect(page?.sections).toHaveLength(sectionCount);
      expect(sectionDemoCount + Number(Boolean(page?.business?.demo))).toBe(
        demoCount,
      );
      expect(Boolean(page?.cta)).toBe(hasCta);
    },
  );

  it("locks model optimization links and its closed-loop business scene", () => {
    const page = getModelSubpage("model-optimization");

    expect(page?.sections[0]?.id).toBe("mo-position");
    expect(page?.sections[2]?.flow).toStrictEqual([
      "数据准备",
      "模型训练",
      "模型评估",
      "优化迭代",
    ]);
    expect(page?.business?.reason).toStrictEqual([
      "数据工厂",
      "模型训练",
      "模型评估",
      "部署迭代",
    ]);
    expect(page?.business?.workflow).toBeUndefined();
    expect(
      page?.business?.scenes.map((scene) => scene.actions[0]?.href),
    ).toStrictEqual([
      "/product/model-training",
      "/product/model-data",
      "/product/model-evaluation",
    ]);
  });

  it("locks task anchors and the three lifecycle detail demonstrations", () => {
    const page = getModelSubpage("model-task-center");

    expect(page?.sections.map((section) => section.id)).toStrictEqual([
      "task-position",
      undefined,
      "task-caps",
      "task-training",
      "task-evaluation",
      "task-inference",
    ]);
    expect(
      page?.sections.slice(3).map((section) => section.demo?.title),
    ).toStrictEqual([
      "训练任务 · 进度演示",
      "评估任务 · 评测结果演示",
      "推理任务 · 服务化演示",
    ]);
  });

  it("locks model assets and training detail anchors", () => {
    expect(
      getModelSubpage("model-assets")?.sections.map((section) => section.id),
    ).toStrictEqual([
      undefined,
      "assets-position",
      "assets-garden",
      "assets-manage",
    ]);
    expect(
      getModelSubpage("model-training")?.sections.map((section) => section.id),
    ).toStrictEqual([
      "train-position",
      undefined,
      "train-caps",
      "train-lora",
      "train-full",
      "train-distill",
    ]);
  });

  it("locks evaluation modes and deployment comparison table", () => {
    const evaluation = getModelSubpage("model-evaluation");
    const deploy = getModelSubpage("model-deploy");

    expect(
      evaluation?.sections.slice(3).map((section) => section.id),
    ).toStrictEqual(["eval-auto", "eval-manual"]);
    expect(deploy?.sections[1]?.table).toStrictEqual({
      columns: ["部署方式", "适用场景", "模型来源", "运行环境"],
      rows: [
        [
          "定制部署",
          "平台内模型服务化",
          "训练中心发布模型 / 模型花园支持定制部署的模型",
          "平台纳管的主机资源，支持多机 / 集群",
        ],
        [
          "专网部署",
          "企业内网已有模型服务",
          "企业专网内模型，模型名称与专网一致",
          "企业专网运行环境，数据不出域",
        ],
        [
          "云端部署",
          "连接云厂商在线模型",
          "云厂商在线模型（模型名称与密钥保持一致）",
          "云厂商运行环境，通过外网接入",
        ],
      ],
    });
  });
});
