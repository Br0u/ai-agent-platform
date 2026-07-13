import { describe, expect, it } from "vitest";
import { shouldShowAssistant } from "./assistant-visibility";

describe("shouldShowAssistant", () => {
  it.each([
    "/",
    "/product",
    "/product/agent-studio",
    "/blog/platform-release",
    "/pricing",
    "/docs",
    "/support",
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
    "/help",
    "/blog",
    "/product/one/more",
  ])("denies the assistant route %s", (pathname) => {
    expect(shouldShowAssistant(pathname)).toBe(false);
  });
});
