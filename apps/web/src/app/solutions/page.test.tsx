import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import SolutionsPage from "./page";

describe("V2 solutions entry", () => {
  it("opens the first V2 directory solution instead of a legacy overview", () => {
    SolutionsPage();
    expect(redirect).toHaveBeenCalledWith("/solutions/finance-compliance");
  });
});
