import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { addSignedSession, fixtureCredentials } from "./auth-fixtures";

const LIST_PATH = "/api/v1/admin/assistant/skills?limit=25&offset=0";

type E2EState = {
  artifactSha256: string;
  revisionId: string;
  revisionNumber: number;
  skillId: string;
  slug: string;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function statePath(): string {
  return requiredEnvironment("SKILL_REGISTRY_E2E_STATE_FILE");
}

function writeState(state: E2EState): void {
  const file = statePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function readState(): E2EState {
  return JSON.parse(readFileSync(statePath(), "utf8")) as E2EState;
}

async function upload(page: Page, archive: string): Promise<E2EState> {
  await page.getByRole("button", { name: "上传 Skill ZIP" }).click();
  await page.getByLabel("Skill ZIP 文件").setInputFiles(archive);
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/v1/admin/assistant/skills/uploads"),
  );
  await page.getByRole("button", { name: "上传", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as {
    revision: {
      artifactSha256: string;
      id: string;
      name: string;
      number: number;
      skillId: string;
    };
  };
  return {
    artifactSha256: body.revision.artifactSha256,
    revisionId: body.revision.id,
    revisionNumber: body.revision.number,
    skillId: body.revision.skillId,
    slug: body.revision.name,
  };
}

test.describe("Skill library lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  test("@lifecycle uploads one Skill and exercises runtime when enabled", async ({
    baseURL,
    browser,
    page,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const archive = requiredEnvironment("SKILL_REGISTRY_E2E_ARCHIVE");
    const slug = requiredEnvironment("SKILL_REGISTRY_E2E_SLUG");
    const origin = new URL(baseURL).origin;

    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().modelAdminSessionToken,
    );
    await page.goto("/admin/assistant");
    const state = await upload(page, archive);
    expect(state.slug).toBe(slug);
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await expect(page.getByText("○ 未启用", { exact: true })).toBeVisible();

    const stale = await browser.newContext({ baseURL });
    await addSignedSession(
      stale,
      baseURL,
      "workforce",
      fixtureCredentials().modelAdminStaleSessionToken,
    );
    const denied = await stale.request.post(
      `/api/v1/admin/assistant/skills/${state.skillId}/enable`,
      {
        headers: { origin },
        data: { requestId: randomUUID() },
      },
    );
    expect(denied.status()).toBe(401);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "reauth_required" },
      redirectTo: "/staff/re-auth",
    });
    await stale.close();

    if (process.env.SKILL_RUNTIME_E2E === "true") {
      await page.getByRole("button", { name: "启用", exact: true }).click();
      await expect(page.getByText("● 已启用", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "停用", exact: true }).click();
      await expect(page.getByText("○ 未启用", { exact: true })).toBeVisible();
    }
    writeState(state);
  });

  test("@restart keeps the uploaded Skill after Registry restart", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const expected = readState();
    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().modelAdminSessionToken,
    );
    const response = await page.context().request.get(LIST_PATH);
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      skills: [
        expect.objectContaining({
          id: expected.skillId,
          name: expected.slug,
          enabled: false,
          replacementToken: expected.artifactSha256,
        }),
      ],
    });
  });
});
