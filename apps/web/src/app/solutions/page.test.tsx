import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  findSolution,
  solutionScenes,
  solutions,
} from "@/components/solutions/solution-content";
import {
  SolutionDetail,
  SolutionScenarioPage,
} from "@/components/solutions/solution-sections";
import SolutionsPage from "./page";

afterEach(cleanup);

describe("SolutionsPage", () => {
  it("starts from customer goals and presents four business solutions plus two foundations", () => {
    render(<SolutionsPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "从业务问题出发，把 AI 交付成可运行的系统",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "你现在最需要解决什么？",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("业务解决方案").length).toBeGreaterThan(0);
    expect(screen.getAllByText("技术底座").length).toBeGreaterThan(0);

    for (const title of [
      "企业 AI 应用开发解决方案",
      "视觉智能分析与主动治理解决方案",
      "政务智能导办与辅助预审解决方案",
      "企业智能办公解决方案",
      "企业 AI 全栈建设解决方案",
      "AI 超融合基础设施解决方案",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("keeps every solution decision-complete and connected to one real scenario", () => {
    expect(solutionScenes).toHaveLength(solutions.length);

    for (const solution of solutions) {
      expect(solution.audience.length).toBeGreaterThanOrEqual(4);
      expect(solution.triggerEvents.length).toBeGreaterThanOrEqual(4);
      expect(solution.challenges.length).toBeGreaterThanOrEqual(4);
      expect(solution.components.length).toBeGreaterThanOrEqual(5);
      expect(solution.architecture.length).toBeGreaterThanOrEqual(5);
      expect(solution.capabilities.length).toBeGreaterThanOrEqual(6);
      expect(solution.workflow.length).toBeGreaterThanOrEqual(5);
      expect(solution.deploymentModes).toHaveLength(3);
      expect(solution.implementation).toHaveLength(4);
      expect(solution.deliverables.length).toBeGreaterThanOrEqual(6);
      expect(solution.prerequisites.length).toBeGreaterThanOrEqual(4);
      expect(solution.acceptance.length).toBeGreaterThanOrEqual(5);
      expect(solution.resources.length).toBeGreaterThanOrEqual(5);
      expect(solution.scene.solutionSlug).toBe(solution.slug);
    }
  });

  it("connects the visual solution to its product, scenario, compatibility and downloads", () => {
    const solution = findSolution("visual-retrieval");
    expect(solution).toBeDefined();

    render(<SolutionDetail solution={solution!} />);

    expect(screen.getByRole("link", { name: "预约方案评估" })).toHaveAttribute(
      "href",
      "/contact?solution=visual-retrieval",
    );
    expect(
      screen.getByRole("link", { name: /查看场景蓝图：城市治理视觉布控/ }),
    ).toHaveAttribute(
      "href",
      "/solutions/visual-retrieval/scenarios/urban-governance-control",
    );
    expect(
      screen.getAllByRole("link", {
        name: /视觉检索一体机 \/ 视频智能体/,
      })[0],
    ).toHaveAttribute("href", "/product/video-agent");
    expect(screen.getByRole("link", { name: /环境兼容矩阵/ })).toHaveAttribute(
      "href",
      "/compatibility",
    );
    expect(screen.getByRole("link", { name: /安装与离线包/ })).toHaveAttribute(
      "href",
      "/downloads",
    );
  });

  it("presents a scenario with evaluation context and reserved evidence", () => {
    const solution = findSolution("visual-retrieval");
    expect(solution).toBeDefined();

    render(
      <SolutionScenarioPage solution={solution!} scene={solution!.scene} />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "城市治理视觉布控" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "提交场景评估" })).toHaveAttribute(
      "href",
      "/contact?solution=visual-retrieval&scene=urban-governance-control",
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "真实资料从这些接口补入",
      }),
    ).toBeInTheDocument();
  });
});
