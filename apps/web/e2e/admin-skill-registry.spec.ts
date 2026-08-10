import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { addSignedSession } from "./auth-fixtures";

const LIST_PATH = "/api/v1/admin/assistant/skills?limit=25&offset=0";

type E2EState = {
  artifactSha256: string;
  revisionId: string;
  revisionNumber: number;
  skillId: string;
  slug: string;
};

type LibrarySkill = {
  enabled: boolean;
  id: string;
  name: string;
  replacementToken: string;
  revisionId: string;
  uploadedAt: string;
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

function uploadResponseState(body: unknown): E2EState {
  const revision = (body as { revision?: Record<string, unknown> }).revision;
  if (!revision) throw new Error("upload response has no revision");
  const artifactSha256 = revision.artifactSha256;
  const revisionId = revision.id;
  const revisionNumber = revision.number;
  const skillId = revision.skillId;
  const slug = revision.name;
  if (
    typeof artifactSha256 !== "string" ||
    typeof revisionId !== "string" ||
    typeof revisionNumber !== "number" ||
    typeof skillId !== "string" ||
    typeof slug !== "string"
  ) {
    throw new Error("upload response has an invalid revision");
  }
  return { artifactSha256, revisionId, revisionNumber, skillId, slug };
}

async function upload(
  page: Page,
  archive: string,
  options: { replacement?: boolean } = {},
): Promise<E2EState> {
  await page.getByRole("button", { name: "上传 Skill ZIP" }).click();
  await page.getByLabel("Skill ZIP 文件").setInputFiles(archive);
  const firstResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/v1/admin/assistant/skills/uploads"),
  );
  const confirmation = options.replacement ? page.waitForEvent("dialog") : null;
  await page.getByRole("button", { name: "上传", exact: true }).click();
  const first = await firstResponse;
  if (!options.replacement) {
    expect(first.status()).toBe(201);
    return uploadResponseState(await first.json());
  }

  expect(first.status()).toBe(409);
  if (confirmation === null)
    throw new Error("replacement confirmation missing");
  const replacementResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/v1/admin/assistant/skills/uploads") &&
      response.status() === 201,
  );
  await (await confirmation).accept();
  const replacement = await replacementResponse;
  return uploadResponseState(await replacement.json());
}

async function librarySkill(
  page: Page,
  skillId: string,
): Promise<LibrarySkill> {
  const response = await page.context().request.get(LIST_PATH);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { skills: LibrarySkill[] };
  const skill = body.skills.find((item) => item.id === skillId);
  expect(skill).toBeDefined();
  return skill!;
}

async function expectMissingSkill(page: Page, skillId: string): Promise<void> {
  const response = await page.context().request.get(LIST_PATH);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { skills: LibrarySkill[] };
  expect(body.skills.some((skill) => skill.id === skillId)).toBe(false);
}

async function mutate(
  page: Page,
  skillId: string,
  operation: "enable" | "disable" | "delete",
): Promise<void> {
  const response = page.waitForResponse((candidate) => {
    const request = candidate.request();
    return (
      request.method() === (operation === "delete" ? "DELETE" : "POST") &&
      new URL(candidate.url()).pathname ===
        `/api/v1/admin/assistant/skills/${skillId}${
          operation === "delete" ? "" : `/${operation}`
        }`
    );
  });
  const confirmation =
    operation === "delete"
      ? page.waitForEvent("dialog").then((dialog) => dialog.accept())
      : null;
  await page
    .getByRole("button", {
      name:
        operation === "delete"
          ? "删除"
          : operation === "enable"
            ? "启用"
            : "停用",
      exact: true,
    })
    .click();
  if (confirmation !== null) await confirmation;
  expect((await response).status()).toBe(200);
}

test.describe("Skill library lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  test("@lifecycle completes the simple Skill lifecycle through product controls", async ({
    baseURL,
    browser,
    page,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const initialArchive = requiredEnvironment(
      "SKILL_REGISTRY_E2E_INITIAL_ARCHIVE",
    );
    const inactiveReplacementArchive = requiredEnvironment(
      "SKILL_REGISTRY_E2E_INACTIVE_REPLACEMENT_ARCHIVE",
    );
    const activeReplacementArchive = requiredEnvironment(
      "SKILL_REGISTRY_E2E_ACTIVE_REPLACEMENT_ARCHIVE",
    );
    const modelAdminSessionToken = requiredEnvironment(
      "E2E_MODEL_ADMIN_SESSION_TOKEN",
    );
    const modelAdminStaleSessionToken = requiredEnvironment(
      "E2E_MODEL_ADMIN_STALE_SESSION_TOKEN",
    );
    const slug = requiredEnvironment("SKILL_REGISTRY_E2E_SLUG");
    const origin = new URL(baseURL).origin;

    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      modelAdminSessionToken,
    );
    await page.goto("/admin/assistant");

    const initial = await upload(page, initialArchive);
    expect(initial.slug).toBe(slug);
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await expect(page.getByText("○ 未启用", { exact: true })).toBeVisible();
    const firstLibraryState = await librarySkill(page, initial.skillId);
    expect(firstLibraryState).toMatchObject({
      enabled: false,
      revisionId: initial.revisionId,
    });
    await expect(
      page.getByText(`上传时间：${firstLibraryState.uploadedAt}`, {
        exact: true,
      }),
    ).toBeVisible();

    const stale = await browser.newContext({ baseURL });
    await addSignedSession(
      stale,
      baseURL,
      "workforce",
      modelAdminStaleSessionToken,
    );
    const denied = await stale.request.post(
      `/api/v1/admin/assistant/skills/${initial.skillId}/enable`,
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

    await mutate(page, initial.skillId, "enable");
    await expect(page.getByText("● 已启用", { exact: true })).toBeVisible();
    expect((await librarySkill(page, initial.skillId)).enabled).toBe(true);

    await mutate(page, initial.skillId, "disable");
    await expect(page.getByText("○ 未启用", { exact: true })).toBeVisible();
    expect((await librarySkill(page, initial.skillId)).enabled).toBe(false);

    const inactiveReplacement = await upload(page, inactiveReplacementArchive, {
      replacement: true,
    });
    const inactiveReplacementState = await librarySkill(page, initial.skillId);
    expect(inactiveReplacement).toMatchObject({ skillId: initial.skillId });
    expect(inactiveReplacement.revisionId).not.toBe(initial.revisionId);
    expect(inactiveReplacementState).toMatchObject({
      enabled: false,
      revisionId: inactiveReplacement.revisionId,
    });

    await mutate(page, initial.skillId, "enable");
    await expect(page.getByText("● 已启用", { exact: true })).toBeVisible();
    const browserEnableRequests: string[] = [];
    const recordBrowserEnable = (request: {
      method(): string;
      url(): string;
    }) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname ===
          `/api/v1/admin/assistant/skills/${initial.skillId}/enable`
      ) {
        browserEnableRequests.push(request.url());
      }
    };
    page.on("request", recordBrowserEnable);
    const activeReplacement = await upload(page, activeReplacementArchive, {
      replacement: true,
    });
    page.off("request", recordBrowserEnable);
    const activeReplacementState = await librarySkill(page, initial.skillId);
    expect(browserEnableRequests).toEqual([]);
    expect(activeReplacement).toMatchObject({ skillId: initial.skillId });
    expect(activeReplacement.revisionId).not.toBe(
      inactiveReplacement.revisionId,
    );
    expect(activeReplacementState).toMatchObject({
      enabled: true,
      revisionId: activeReplacement.revisionId,
    });

    await mutate(page, initial.skillId, "delete");
    await expect(page.getByText(slug, { exact: true })).not.toBeVisible();
    await expectMissingSkill(page, initial.skillId);

    const reuploaded = await upload(page, initialArchive);
    const reuploadedState = await librarySkill(page, reuploaded.skillId);
    expect(reuploaded).toMatchObject({ slug });
    expect(reuploaded.skillId).not.toBe(initial.skillId);
    expect(reuploadedState).toMatchObject({
      enabled: false,
      revisionId: reuploaded.revisionId,
    });
    writeState(reuploaded);
  });

  test("@restart keeps the re-uploaded inactive Skill after Registry restart", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const expected = readState();
    const modelAdminSessionToken = requiredEnvironment(
      "E2E_MODEL_ADMIN_SESSION_TOKEN",
    );
    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      modelAdminSessionToken,
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

  for (const [tag, operation, enabled] of [
    ["@runtime-activate", "enable", true],
    ["@runtime-empty", "disable", false],
    ["@runtime-reenable", "enable", true],
  ] as const) {
    test(`${tag} updates the runtime Skill set`, async ({ baseURL, page }) => {
      if (!baseURL) throw new Error("baseURL is required");
      const expected = readState();
      await addSignedSession(
        page.context(),
        baseURL,
        "workforce",
        requiredEnvironment("E2E_MODEL_ADMIN_SESSION_TOKEN"),
      );
      await page.goto("/admin/assistant");
      await mutate(page, expected.skillId, operation);
      expect((await librarySkill(page, expected.skillId)).enabled).toBe(
        enabled,
      );
    });
  }
});
