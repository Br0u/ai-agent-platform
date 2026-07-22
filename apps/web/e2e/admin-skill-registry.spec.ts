import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  addSignedSession,
  fixtureCredentials,
  totpFromUri,
} from "./auth-fixtures";

const LIST_PATH = "/api/v1/admin/assistant/skills?limit=25&offset=0";
// The local fixture contains only SKILL.md and scripts/hello.py. The runner
// creates it with Python's standard library and never downloads source code.
const FIXTURE_MEMBERS = ["SKILL.md", "scripts/hello.py"] as const;

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

function storageStatePath(): string {
  return requiredEnvironment("SKILL_REGISTRY_E2E_STORAGE_STATE_FILE");
}

function writeState(state: E2EState): void {
  const file = statePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function readState(): E2EState {
  const parsed = JSON.parse(readFileSync(statePath(), "utf8")) as E2EState;
  expect(parsed.artifactSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(parsed.revisionNumber).toBeGreaterThan(0);
  return parsed;
}

test.describe("Skill Registry delivery", () => {
  test.describe.configure({ mode: "serial" });

  test("@lifecycle workforce:admin uploads pending and workforce:super_admin publishes after MFA", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    expect(FIXTURE_MEMBERS).toEqual(["SKILL.md", "scripts/hello.py"]);
    const archive = requiredEnvironment("SKILL_REGISTRY_E2E_ARCHIVE");
    const slug = requiredEnvironment("SKILL_REGISTRY_E2E_SLUG");
    const originHeaders = { origin: new URL(baseURL).origin };

    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().adminSessionToken,
    );
    expect(
      (await page.context().request.get("/api/v1/session/staff")).status(),
    ).toBe(200);
    await page.goto("/admin/assistant");
    await expect(page).toHaveURL(/\/admin\/assistant$/u);
    await expect(page.getByRole("heading", { name: "Skill 库" })).toBeVisible();
    await page.getByRole("button", { name: "上传 Skill ZIP" }).click();
    await page.getByLabel("Skill ZIP 文件").setInputFiles(archive);
    const uploadedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/v1/admin/assistant/skills/uploads"),
    );
    await page.getByRole("button", { name: "提交审核" }).click();
    const uploaded = await uploadedResponse;
    expect(uploaded.status()).toBe(201);
    const uploadBody = (await uploaded.json()) as {
      revision: {
        artifactSha256: string;
        id: string;
        name: string;
        number: number;
        skillId: string;
        state: string;
      };
    };
    expect(uploadBody.revision).toMatchObject({
      name: slug,
      state: "pending_review",
    });
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await expect(
      page.getByText("pending_review", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `查看审核详情 ${slug}` }),
    ).toHaveCount(0);

    const uploaderList = await page.context().request.get(LIST_PATH);
    expect(uploaderList.status()).toBe(200);
    await expect(uploaderList.json()).resolves.toMatchObject({
      permissions: { canReview: false, canUpload: true },
      skills: [
        expect.objectContaining({
          id: uploadBody.revision.skillId,
          revision: expect.objectContaining({
            id: uploadBody.revision.id,
            state: "pending_review",
          }),
        }),
      ],
    });

    // Actor A lacks review permission; a direct self-review attempt is denied
    // before it can mutate the pending revision.
    const selfReview = await page
      .context()
      .request.post(
        `/api/v1/admin/assistant/skills/${uploadBody.revision.skillId}/revisions/${uploadBody.revision.id}/review`,
        {
          headers: originHeaders,
          data: {
            decision: "approve",
            expectedState: "pending_review",
            reason: null,
            attestations: {
              contentReviewed: true,
              usageRightsConfirmed: true,
              executionRiskAccepted: true,
              independentReviewerConfirmed: true,
            },
          },
        },
      );
    expect(selfReview.status(), "self-review must be denied").toBe(403);
    await expect(selfReview.json()).resolves.toMatchObject({
      error: { code: "permission_denied" },
    });
    await page.context().clearCookies();

    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().modelAdminSessionToken,
    );
    const unassuredSession = await page
      .context()
      .request.get("/api/v1/session/staff");
    expect(unassuredSession.status()).toBe(403);
    await expect(unassuredSession.json()).resolves.toMatchObject({
      error: { code: "AUTH_TOTP_SETUP_REQUIRED" },
    });
    await page.goto("/staff/two-factor?returnTo=%2Fadmin%2Fassistant");
    await page.getByLabel("当前密码").fill(fixtureCredentials().adminPassword);
    await page.getByRole("button", { name: "开始设置" }).click();
    const totpUri = (
      await page.locator("code").filter({ hasText: "otpauth://" }).textContent()
    )?.trim();
    if (!totpUri) throw new Error("reviewer TOTP URI was not rendered");
    await page.getByLabel("六位验证码").fill(totpFromUri(totpUri));
    await page.getByRole("button", { name: "验证并启用" }).click();
    await expect(page).toHaveURL(/\/admin\/assistant$/u);
    expect(
      (await page.context().request.get("/api/v1/session/staff")).status(),
    ).toBe(200);
    await page.getByRole("button", { name: `查看审核详情 ${slug}` }).click();
    await expect(
      page.getByRole("heading", { name: "Revision 审核详情" }),
    ).toBeVisible();
    await expect(
      page.getByText(uploadBody.revision.artifactSha256, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "打开审核操作" }).click();
    const reviewDialog = page.getByRole("dialog");
    await expect(reviewDialog).toBeVisible();
    for (const label of [
      "已逐项审阅内容和文件",
      "已确认使用权和许可证",
      "已评估并接受执行风险",
      "确认审核人与创建者相互独立",
    ]) {
      await reviewDialog.getByLabel(label).check();
    }
    const reviewedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .endsWith(
            `/skills/${uploadBody.revision.skillId}/revisions/${uploadBody.revision.id}/review`,
          ),
    );
    await reviewDialog.getByRole("button", { name: "批准发布" }).click();
    expect((await reviewedResponse).status()).toBe(200);
    await expect(page.getByText("published").first()).toBeVisible();
    writeState({
      artifactSha256: uploadBody.revision.artifactSha256,
      revisionId: uploadBody.revision.id,
      revisionNumber: uploadBody.revision.number,
      skillId: uploadBody.revision.skillId,
      slug,
    });
    const reviewerStorageState = storageStatePath();
    await page.context().storageState({ path: reviewerStorageState });
    chmodSync(reviewerStorageState, 0o600);
    await page.context().clearCookies();
  });

  test("@restart preserves the published revision and artifactSha256", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const expected = readState();
    const reviewer = await browser.newContext({
      baseURL,
      storageState: storageStatePath(),
    });
    const detail = await reviewer.request.get(
      `/api/v1/admin/assistant/skills/${expected.skillId}/revisions/${expected.revisionId}`,
    );
    expect(detail.status()).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      revision: {
        artifactSha256: expected.artifactSha256,
        id: expected.revisionId,
        number: expected.revisionNumber,
        skillId: expected.skillId,
        state: "published",
      },
    });
    const list = await reviewer.request.get(LIST_PATH);
    expect(list.status()).toBe(200);
    const listBody = (await list.json()) as {
      skills: Array<{
        id: string;
        revision: { id: string; state: string } | null;
      }>;
    };
    expect(listBody.skills).toContainEqual(
      expect.objectContaining({
        id: expected.skillId,
        revision: expect.objectContaining({
          id: expected.revisionId,
          state: "published",
        }),
      }),
    );
    await reviewer.close();
  });
});
