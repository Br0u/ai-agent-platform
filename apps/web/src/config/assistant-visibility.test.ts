import { describe, expect, it } from "vitest";
import { shouldShowAssistant } from "./assistant-visibility";

describe("shouldShowAssistant", () => {
  it.each([
    "/",
    "/product",
    "/pricing",
    "/docs",
    "/support",
    "/help",
    "/contact",
    "/assistant",
  ])("allows the registered assistant route %s", (pathname) => {
    expect(shouldShowAssistant(pathname)).toBe(true);
  });

  it.each([
    "/unknown",
    "/login",
    "/register",
    "/staff/login",
    "/staff/anything",
    "/console",
    "/console/profile",
    "/admin",
    "/admin/products",
    "/product/one/more",
    "/product/agent-studio",
    "/blog/platform-release",
    "/blog",
    "/releases",
    "/roadmap",
    "/assistant-old",
  ])("denies the assistant route %s", (pathname) => {
    expect(shouldShowAssistant(pathname)).toBe(false);
  });
});
