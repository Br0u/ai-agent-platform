import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeHero } from "./home-sections";

afterEach(cleanup);

describe("HomeHero", () => {
  it("places 联系我们 immediately after 查看解决方案 with the official topic", () => {
    render(<HomeHero />);

    const actions = screen
      .getByRole("heading", { level: 1 })
      .parentElement!.querySelector(".home-actions") as HTMLElement;
    expect(
      within(actions)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["查看解决方案", "/solutions"],
      ["联系我们", "/contact?topic=官网咨询"],
    ]);
    expect(
      within(actions).queryByRole("link", { name: "申请体验" }),
    ).toBeNull();
  });
});
