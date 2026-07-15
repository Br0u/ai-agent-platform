import { describe, expect, it } from "vitest";
import { classifyShellRoute } from "./shell-route";

describe("classifyShellRoute", () => {
  it.each([
    ["/", "portal"],
    ["/pricing", "portal"],
    ["/assistant", "assistant"],
    ["/login", "auth"],
    ["/register", "auth"],
    ["/staff/login", "auth"],
    ["/staff/two-factor", "auth"],
    ["/console", "console"],
    ["/console/profile", "console"],
    ["/admin", "admin"],
    ["/admin/products", "admin"],
  ] as const)("classifies %s as %s", (pathname, expected) => {
    expect(classifyShellRoute(pathname)).toBe(expected);
  });

  it.each([
    "/administrator",
    "/admin-old",
    "/console-old",
    "/staffing",
    "/logins",
    "/registering",
    "/assistant-old",
  ])(
    "does not confuse the similar prefix %s with a reserved shell",
    (pathname) => {
      expect(classifyShellRoute(pathname)).toBe("portal");
    },
  );
});
