import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ModelAssetsPage, {
  metadata as modelAssetsMetadata,
} from "../app/product/model-assets/page";
import ModelDataPage, {
  metadata as modelDataMetadata,
} from "../app/product/model-data/page";
import ModelDeployPage, {
  metadata as modelDeployMetadata,
} from "../app/product/model-deploy/page";
import ModelEvaluationPage, {
  metadata as modelEvaluationMetadata,
} from "../app/product/model-evaluation/page";
import ModelOptimizationPage, {
  metadata as modelOptimizationMetadata,
} from "../app/product/model-optimization/page";
import ModelTaskCenterPage, {
  metadata as modelTaskCenterMetadata,
} from "../app/product/model-task-center/page";
import ModelTrainingPage, {
  metadata as modelTrainingMetadata,
} from "../app/product/model-training/page";
import { getModelSubpage, modelSubpageSlugs } from "./model-subpage-content";
import { PlatformPageDetail } from "./platform-center-detail";

afterEach(cleanup);

const routedPages = [
  {
    slug: "model-optimization",
    Page: ModelOptimizationPage,
    metadata: modelOptimizationMetadata,
    title: "模型优化：数据、训练、评估，让模型更懂业务",
    description:
      "通用模型不懂企业业务。模型优化通过数据准备、模型训练与效果评估，让模型学会企业知识、验证业务效果，形成「数据 → 训练 → 评估」的优化闭环。",
  },
  {
    slug: "model-task-center",
    Page: ModelTaskCenterPage,
    metadata: modelTaskCenterMetadata,
    title: "任务中心：模型任务统一管理",
    description:
      "把推理、训练、评估三类模型任务统一管理，让每个任务都调度到匹配的资源上执行，状态随时可查。",
  },
  {
    slug: "model-assets",
    Page: ModelAssetsPage,
    metadata: modelAssetsMetadata,
    title: "模型资产管理：让企业模型资产一条线管到底",
    description:
      "模型花园负责选型、模型纳管负责接入，训练、评估、部署从同一处取用模型——把企业散落的模型资产，收成一条清晰的主线。",
  },
  {
    slug: "model-training",
    Page: ModelTrainingPage,
    metadata: modelTrainingMetadata,
    title: "模型训练：让模型更贴合你的业务",
    description:
      "通过数据集准备与三种训练方式，让通用模型学会企业专属知识，回答更准确、更懂业务。",
  },
  {
    slug: "model-evaluation",
    Page: ModelEvaluationPage,
    metadata: modelEvaluationMetadata,
    title: "模型评估：效果好不好，用数据说话",
    description:
      "通过自动评测与人工评测验证模型效果，为模型选型、优化与上线提供依据，让每个模型决策都有数据支撑。",
  },
  {
    slug: "model-data",
    Page: ModelDataPage,
    metadata: modelDataMetadata,
    title: "数据准备：训练效果从数据开始",
    description:
      "通过数据工厂统一管理训练、评测与蒸馏数据集，支持创建、上传、查看、下载与发布，为模型训练与评估提供高质量数据来源。",
  },
  {
    slug: "model-deploy",
    Page: ModelDeployPage,
    metadata: modelDeployMetadata,
    title: "模型部署：让模型变成可调用的服务",
    description:
      "通过定制、专网、云端三种部署方式，把训练完成的模型或接入的模型服务变成可被智能体与业务应用调用的能力，按需选择部署与运行环境。",
  },
] as const;

describe("model subpage family", () => {
  it.each(routedPages)(
    "wires the $slug Page to its fixed content and metadata",
    ({ Page, description, metadata, title }) => {
      const { container } = render(<Page />);

      expect(
        screen.getAllByRole("heading", {
          level: 1,
          name: title,
        }),
      ).toHaveLength(1);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(metadata).toMatchObject({ title, description });
    },
  );

  it.each(modelSubpageSlugs)("renders the complete %s page", (slug) => {
    const page = getModelSubpage(slug)!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(
      screen.getByRole("heading", { level: 1, name: page.hero.title }),
    ).toBeVisible();
    expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
      page.sections.length,
    );
    expect(Boolean(screen.queryByTestId("platform-center-business"))).toBe(
      Boolean(page.business),
    );
    expect(Boolean(screen.queryByTestId("platform-center-cta"))).toBe(
      Boolean(page.cta),
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("main")).toHaveClass(
      "platform-center--dense",
    );
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });

  it("renders section demonstrations without creating another chat entry", () => {
    const page = getModelSubpage("model-task-center")!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(screen.getAllByTestId("platform-page-demo")).toHaveLength(4);
    expect(screen.getByText("训练任务 · 进度演示")).toBeVisible();
    expect(screen.getByText("模型任务中心")).toBeVisible();
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });

  it("renders deployment anchors, comparison rows and group flows", () => {
    const page = getModelSubpage("model-deploy")!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(screen.getAllByTestId("platform-center-table-row")).toHaveLength(3);
    for (const id of ["deploy-custom", "deploy-private", "deploy-cloud"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(screen.getAllByTestId("platform-page-group-flow")).toHaveLength(3);
    expect(
      within(screen.getAllByTestId("platform-page-group-flow")[0]!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual([
      "模型花园一键部署 / 任务中心创建推理任务",
      "选择定制部署",
      "选择模型与主机资源",
      "配置并创建",
    ]);
  });

  it("keeps the original visual slots and semantic model links", () => {
    const page = getModelSubpage("model-data")!;
    render(<PlatformPageDetail page={page} />);

    expect(screen.getByText("数据工厂功能总览界面截图素材槽位")).toBeVisible();
    for (const link of screen.getAllByRole("link", {
      name: "查看模型训练 →",
    })) {
      expect(link).toHaveAttribute("href", "/product/model-training");
    }
    for (const link of screen.getAllByRole("link", {
      name: "查看模型评估 →",
    })) {
      expect(link).toHaveAttribute("href", "/product/model-evaluation");
    }
  });
});
