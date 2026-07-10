import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routeRegistry } from "./routes";

const appDirectory = resolve(process.cwd(), "src/app");

function pageFileForRoute(pathname: string) {
  if (pathname === "/") return `${appDirectory}/page.tsx`;
  return `${appDirectory}/${pathname.slice(1)}/page.tsx`;
}

describe("registered route files", () => {
  it("provides an explicit App Router page for every registered route", () => {
    const missingRoutes = routeRegistry
      .filter((route) => !existsSync(pageFileForRoute(route.path)))
      .map((route) => route.path);

    expect(missingRoutes).toEqual([]);
  });
});
