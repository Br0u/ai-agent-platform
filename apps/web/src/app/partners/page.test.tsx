import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PartnersPage, { metadata } from "./page";

describe("PartnersPage", () => {
  it("keeps partner-specific metadata independent from the shared route registry", () => {
    expect(metadata).toEqual({
      title: "合作伙伴 · 华鲲元启",
      description:
        "面向渠道、交付与技术伙伴，提供多元合作模式、清晰分润政策与全链路赋能支持，共同开拓企业 AI 市场。",
    });

    render(<PartnersPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "共建企业 AI 生态，共享增长机遇",
      }),
    ).toBeVisible();
  });
});
