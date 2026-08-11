import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appDirectory = resolve(process.cwd(), "src/app");

const deletedPageFiles = [
  "[...slug]/page.tsx",
  "releases/page.tsx",
  "releases/[version]/page.tsx",
  "roadmap/page.tsx",
  "openlab/page.tsx",
  "compatibility/page.tsx",
  "marketplace/page.tsx",
  "marketplace/[slug]/page.tsx",
  "blog/page.tsx",
  "blog/[slug]/page.tsx",
  "cases/page.tsx",
  "product/[slug]/page.tsx",
  "product/hci/page.tsx",
  "product/knowledge-agent/page.tsx",
  "product/office-agent/page.tsx",
  "product/tgdataxai/page.tsx",
  "product/video-agent/page.tsx",
] as const;

const retainedPageFiles = [
  "support/page.tsx",
  "help/page.tsx",
  "docs/page.tsx",
  "docs/[category]/page.tsx",
  "assistant/page.tsx",
  "login/page.tsx",
  "register/page.tsx",
  "staff/login/page.tsx",
  "staff/change-password/page.tsx",
  "staff/two-factor/page.tsx",
  "staff/re-auth/page.tsx",
  "console/page.tsx",
  "console/onboarding/page.tsx",
  "admin/page.tsx",
  "admin/docs/page.tsx",
  "admin/docs/preview/[revisionId]/page.tsx",
] as const;

describe("public route files", () => {
  it("removes every public page outside the prototype", () => {
    const remaining = deletedPageFiles.filter((file) =>
      existsSync(resolve(appDirectory, file)),
    );

    expect(remaining).toEqual([]);
  });

  it("keeps representative protected and support pages", () => {
    const missing = retainedPageFiles.filter(
      (file) => !existsSync(resolve(appDirectory, file)),
    );

    expect(missing).toEqual([]);
  });
});
