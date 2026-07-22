import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { addSignedSession, fixtureCredentials } from "./auth-fixtures";

const LIST_PATH = "/api/v1/admin/assistant/skills?limit=25&offset=0";
// The local fixture contains only SKILL.md and scripts/hello.py. The runner
// creates it with Python's standard library and never downloads source code.
const FIXTURE_MEMBERS =
  process.env.SKILL_RUNTIME_E2E === "true"
    ? (["SKILL.md", "scripts/record.py"] as const)
    : (["SKILL.md", "scripts/hello.py"] as const);

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

function runtimeStatePath(): string {
  return requiredEnvironment("SKILL_RUNTIME_E2E_STATE_FILE");
}

function readRuntimeState(): {
  activeSetId: string;
  activationVersion: number;
} {
  return JSON.parse(readFileSync(runtimeStatePath(), "utf8")) as {
    activeSetId: string;
    activationVersion: number;
  };
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
    expect(FIXTURE_MEMBERS).toEqual(
      process.env.SKILL_RUNTIME_E2E === "true"
        ? ["SKILL.md", "scripts/record.py"]
        : ["SKILL.md", "scripts/hello.py"],
    );
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
      fixtureCredentials().modelAdminStaleSessionToken,
    );
    expect(
      (await page.context().request.get("/api/v1/session/staff")).status(),
    ).toBe(200);
    const staleRuntime = await page
      .context()
      .request.post("/api/v1/admin/assistant/skill-runtime/candidates", {
        headers: originHeaders,
        data: {
          agentId: "maduoduo",
          revisionIds: [uploadBody.revision.id],
          requestId: randomUUID(),
        },
      });
    expect(staleRuntime.status()).toBe(401);
    await expect(staleRuntime.json()).resolves.toMatchObject({
      error: { code: "reauth_required" },
    });
    await page.context().clearCookies();
    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().modelAdminSessionToken,
    );
    expect(
      (await page.context().request.get("/api/v1/session/staff")).status(),
    ).toBe(200);
    await page.goto("/admin/assistant");
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

  test("@runtime-activate requires MFA and activates the exact reviewed revision", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const expected = readState();
    const originHeaders = { origin: new URL(baseURL).origin };
    const commandPath = "/api/v1/admin/assistant/skill-runtime/candidates";

    const anonymous = await browser.newContext({ baseURL });
    const unauthorized = await anonymous.request.post(commandPath, {
      headers: originHeaders,
      data: {
        agentId: "maduoduo",
        revisionIds: [expected.revisionId],
        requestId: randomUUID(),
      },
    });
    expect(unauthorized.status()).toBe(401);
    await anonymous.close();

    const reviewer = await browser.newContext({
      baseURL,
      storageState: storageStatePath(),
    });
    const beforeResponse = await reviewer.request.get(
      "/api/v1/admin/assistant/skill-runtime",
    );
    expect(beforeResponse.status()).toBe(200);
    const before = (await beforeResponse.json()) as {
      registry: { activationVersion: number };
    };
    const created = await reviewer.request.post(commandPath, {
      headers: originHeaders,
      data: {
        agentId: "maduoduo",
        revisionIds: [expected.revisionId],
        requestId: randomUUID(),
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = (await created.json()) as {
      set: { id: string; revisionIds: string[]; state: string };
    };
    expect(createdBody.set).toMatchObject({
      revisionIds: [expected.revisionId],
      state: "candidate",
    });
    const activated = await reviewer.request.post(
      `/api/v1/admin/assistant/skill-runtime/candidates/${createdBody.set.id}/activate`,
      {
        headers: originHeaders,
        data: {
          expectedActivationVersion: before.registry.activationVersion,
          requestId: randomUUID(),
        },
      },
    );
    expect(activated.status()).toBe(200);
    const activatedBody = (await activated.json()) as {
      activation: { activationVersion: number; setId: string };
    };
    expect(activatedBody.activation).toMatchObject({
      setId: createdBody.set.id,
    });
    expect(activatedBody.activation.activationVersion).toBe(
      before.registry.activationVersion + 1,
    );
    const runtimeState = runtimeStatePath();
    writeFileSync(
      runtimeState,
      `${JSON.stringify({
        activeSetId: createdBody.set.id,
        activationVersion: activatedBody.activation.activationVersion,
      })}\n`,
      { mode: 0o600 },
    );
    chmodSync(runtimeState, 0o600);
    await reviewer.close();
  });

  test("@runtime-empty activates an explicit empty set", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const current = readRuntimeState();
    const reviewer = await browser.newContext({
      baseURL,
      storageState: storageStatePath(),
    });
    const headers = { origin: new URL(baseURL).origin };
    const created = await reviewer.request.post(
      "/api/v1/admin/assistant/skill-runtime/candidates",
      {
        headers,
        data: {
          agentId: "maduoduo",
          revisionIds: [],
          requestId: randomUUID(),
        },
      },
    );
    expect(created.status()).toBe(201);
    const candidate = (await created.json()) as {
      set: { id: string; itemCount: number };
    };
    expect(candidate.set.itemCount).toBe(0);
    const activated = await reviewer.request.post(
      `/api/v1/admin/assistant/skill-runtime/candidates/${candidate.set.id}/activate`,
      {
        headers,
        data: {
          expectedActivationVersion: current.activationVersion,
          requestId: randomUUID(),
        },
      },
    );
    expect(activated.status()).toBe(200);
    const result = (await activated.json()) as {
      activation: { activationVersion: number; setId: string };
    };
    expect(result.activation).toMatchObject({
      activationVersion: current.activationVersion + 1,
      setId: candidate.set.id,
    });
    writeFileSync(
      runtimeStatePath(),
      `${JSON.stringify({
        activeSetId: candidate.set.id,
        activationVersion: result.activation.activationVersion,
      })}\n`,
      { mode: 0o600 },
    );
    chmodSync(runtimeStatePath(), 0o600);
    await reviewer.close();
  });

  test("@runtime-rollback clones and reactivates the immediate previous set", async ({
    baseURL,
    browser,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const current = readRuntimeState();
    const reviewer = await browser.newContext({
      baseURL,
      storageState: storageStatePath(),
    });
    const snapshotResponse = await reviewer.request.get(
      "/api/v1/admin/assistant/skill-runtime",
    );
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = (await snapshotResponse.json()) as {
      registry: { previous: { id: string } | null };
    };
    expect(snapshot.registry.previous).not.toBeNull();
    const previousSetId = snapshot.registry.previous?.id;
    if (!previousSetId) throw new Error("previous Skill set is required");
    const rolledBack = await reviewer.request.post(
      "/api/v1/admin/assistant/skill-runtime/rollback",
      {
        headers: { origin: new URL(baseURL).origin },
        data: {
          expectedActivationVersion: current.activationVersion,
          expectedPreviousSetId: previousSetId,
          requestId: randomUUID(),
          activationRequestId: randomUUID(),
        },
      },
    );
    expect(rolledBack.status()).toBe(200);
    const result = (await rolledBack.json()) as {
      activation: { activationVersion: number; setId: string };
    };
    expect(result.activation.activationVersion).toBe(
      current.activationVersion + 1,
    );
    expect(result.activation.setId).not.toBe(current.activeSetId);
    writeFileSync(
      runtimeStatePath(),
      `${JSON.stringify({
        activeSetId: result.activation.setId,
        activationVersion: result.activation.activationVersion,
      })}\n`,
      { mode: 0o600 },
    );
    chmodSync(runtimeStatePath(), 0o600);
    await reviewer.close();
  });
});
