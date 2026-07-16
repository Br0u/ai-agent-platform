import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("presents the enterprise platform and solution hierarchy", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "让企业 AI 从模型走向业务" }),
    ).toBeVisible();
    expect(screen.getByText("华鲲元启 AI开发赋能平台")).toBeVisible();
    expect(screen.getByRole("link", { name: "了解平台" })).toHaveAttribute(
      "href",
      "/product",
    );
    expect(screen.getByRole("link", { name: "阅读文档" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(
      screen.getByRole("img", { name: "华鲲元启应用广场界面" }),
    ).toBeVisible();
    expect(screen.getAllByText("场景方案")).toHaveLength(3);
    expect(screen.getAllByText("平台方案")).toHaveLength(2);
    expect(screen.queryByText("数据问答与报告生成")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /智能办公一体化/u }),
    ).toHaveAttribute("href", "/solutions/smart-office");
    expect(
      screen.getByRole("link", { name: /智能导办一体化/u }),
    ).toHaveAttribute("href", "/solutions/intelligent-guidance");
    expect(
      screen.getByRole("link", { name: /视觉检索一体化/u }),
    ).toHaveAttribute("href", "/solutions/visual-search");
    expect(
      screen.getByRole("link", { name: /企业智能体开发/u }),
    ).toHaveAttribute("href", "/solutions/agent-development");
    expect(
      screen.getByRole("link", { name: /AI 超融合与私有部署/u }),
    ).toHaveAttribute("href", "/solutions/ai-infrastructure");
    expect(screen.queryByText("AI Agent Platform")).not.toBeInTheDocument();
  });
});
