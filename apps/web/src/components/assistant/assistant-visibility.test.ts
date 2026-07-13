import { describe, expect, it } from "vitest";
import { shouldShowAssistant } from "./assistant-visibility";

describe("shouldShowAssistant", () => {
  it.each(["/", "/docs", "/product/agent-studio", "/contact"])(
    "shows the assistant on registered public content route %s",
    (pathname) => {
      expect(shouldShowAssistant(pathname)).toBe(true);
    },
  );

  it.each([
    "/login",
    "/register",
    "/staff/login",
    "/staff/two-factor",
    "/console",
    "/console/profile",
    "/admin",
    "/admin/products",
    "/unknown",
  ])("hides the assistant on excluded route %s", (pathname) => {
    expect(shouldShowAssistant(pathname)).toBe(false);
  });
});
