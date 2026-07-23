import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminSkillListResponse } from "@/features/assistant/admin-skill-contract";
import {
  AssistantSkillRegistryPanel,
  type AdminSkillRegistrySnapshot,
} from "./assistant-skill-registry-panel";

const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REVIEWER_ID = "22222222-2222-4222-8222-222222222222";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function listEnvelope(skills: AdminSkillListResponse["skills"]) {
  return {
    version: "1" as const,
    skills,
    page: { limit: 25, offset: 0, returned: skills.length },
    permissions: {
      canUpload: true,
      canManageConnections: false,
      canReview: true,
      canConfigure: false,
    },
    requestId: "list-refresh",
  };
}

function uploadEnvelope() {
  return {
    version: "1" as const,
    revision: {
      id: REVISION_ID,
      skillId: SKILL_ID,
      name: "safe-review",
      number: 1,
      state: "pending_review" as const,
      sourceType: "upload" as const,
      artifactSha256: "a".repeat(64),
      createdBy: ACTOR_ID,
      createdAt: "2026-07-21T08:00:00.000Z",
      reviewedBy: null,
      reviewedAt: null,
    },
    requestId: "upload-race",
  };
}

function detailEnvelope() {
  return {
    version: "1" as const,
    revision: {
      ...uploadEnvelope().revision,
      number: 2,
      description: "review detail",
      license: "Apache-2.0",
      compatibility: "Agno 2.7.2",
      allowedTools: [],
      compressedSize: 100,
      extractedSize: 100,
      fileCount: 1,
    },
    files: [
      {
        path: "SKILL.md",
        sha256: "b".repeat(64),
        size: 100,
        mediaType: "text/markdown",
        kind: "manifest" as const,
      },
    ],
    dependencies: { pythonModules: [], unavailablePythonModules: [] },
    findings: [],
    previousPublishedRevisionId: null,
    diff: null,
    reviewAttestations: {
      contentReviewed: true as const,
      usageRightsConfirmed: true as const,
      executionRiskAccepted: true as const,
      independentReviewerConfirmed: true as const,
    },
    requestId: "detail-race",
  };
}

const list = {
  version: "1",
  skills: [
    {
      id: SKILL_ID,
      name: "safe-review",
      createdAt: "2026-07-21T08:00:00.000Z",
      revision: {
        id: REVISION_ID,
        number: 2,
        state: "pending_review",
        sourceType: "upload",
        artifactSha256Prefix: "aaaaaaaaaaaa",
        createdBy: ACTOR_ID,
        createdAt: "2026-07-21T08:00:00.000Z",
        reviewedBy: null,
        reviewedAt: null,
      },
    },
  ],
  page: { limit: 25, offset: 0, returned: 1 },
} satisfies AdminSkillListResponse;

const snapshot: AdminSkillRegistrySnapshot = {
  capability: "available",
  skills: list.skills,
  page: list.page,
};

const readOnlyPermissions = {
  canUpload: false,
  canManageConnections: false,
  canReview: false,
  canConfigure: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSkillRegistryPanel", () => {
  it("shows a read-only snapshot without exposing or requesting revision detail", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssistantSkillRegistryPanel
        actorUserId={ACTOR_ID}
        canRead
        initialPermissions={readOnlyPermissions}
        initialSnapshot={snapshot}
      />,
    );

    expect(screen.getByRole("heading", { name: "Skill 库" })).toBeVisible();
    expect(screen.getByText("safe-review")).toBeVisible();
    expect(screen.getByText("pending_review")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /查看.*详情/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /上传/u }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the last good snapshot and announces a degraded refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no", { status: 503 })),
    );
    render(
      <AssistantSkillRegistryPanel
        actorUserId={ACTOR_ID}
        canRead
        initialPermissions={readOnlyPermissions}
        initialSnapshot={snapshot}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/刷新失败.*旧数据/u),
    );
    expect(screen.getByText("safe-review")).toBeVisible();
    expect(screen.queryByText("当前没有 Skill")).not.toBeInTheDocument();
  });

  it("adds an uploaded revision as pending_review and restores trigger focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            version: "1",
            revision: {
              id: REVISION_ID,
              skillId: SKILL_ID,
              name: "safe-review",
              number: 1,
              state: "pending_review",
              sourceType: "upload",
              artifactSha256: "a".repeat(64),
              createdBy: ACTOR_ID,
              createdAt: "2026-07-21T08:00:00.000Z",
              reviewedBy: null,
              reviewedAt: null,
            },
            requestId: "66666666-6666-4666-8666-666666666666",
          },
          { status: 201 },
        ),
      ),
    );
    const uploadPermissions = { ...readOnlyPermissions, canUpload: true };
    render(
      <AssistantSkillRegistryPanel
        actorUserId={ACTOR_ID}
        canRead
        initialPermissions={uploadPermissions}
        initialSnapshot={{
          capability: "available",
          skills: [],
          page: { limit: 25, offset: 0, returned: 0 },
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "上传 Skill ZIP" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review.zip", { type: "application/zip" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    expect(await screen.findByText("safe-review")).toBeVisible();
    expect(screen.getByText("pending_review")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/等待审核/u);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.textContent).not.toContain("已启用");
  });

  it("opens an existing Skill update with its target ID prefilled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(uploadEnvelope(), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillRegistryPanel
        actorUserId={ACTOR_ID}
        canRead
        initialPermissions={{ ...readOnlyPermissions, canUpload: true }}
        initialSnapshot={snapshot}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "上传新版本 safe-review" }),
    );
    const target = screen.getByLabelText(/目标 Skill ID/u);
    expect(target).toHaveValue(SKILL_ID);
    expect(target).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review-v2.zip", {
            type: "application/zip",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("targetSkillId")).toBe(SKILL_ID);
  });

  it("does not let a late list refresh overwrite a completed upload", async () => {
    const staleList = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      return String(input).includes("?limit=25")
        ? staleList.promise
        : Promise.resolve(Response.json(uploadEnvelope(), { status: 201 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillRegistryPanel
        actorUserId={ACTOR_ID}
        canRead
        initialPermissions={{ ...readOnlyPermissions, canUpload: true }}
        initialSnapshot={{
          capability: "available",
          skills: [],
          page: { limit: 25, offset: 0, returned: 0 },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));
    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review.zip", { type: "application/zip" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
    expect(await screen.findByText("safe-review")).toBeVisible();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);

    staleList.resolve(Response.json(listEnvelope([])));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("safe-review")).toBeVisible();
    expect(screen.getByText("pending_review")).toBeVisible();
  });

  it("does not let a late list refresh overwrite a completed review", async () => {
    const staleList = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const url = String(input);
      if (url.includes("?limit=25")) return staleList.promise;
      if (url.endsWith("/review")) {
        return Promise.resolve(
          Response.json({
            version: "1",
            revision: {
              ...uploadEnvelope().revision,
              number: 2,
              state: "published",
              reviewedBy: REVIEWER_ID,
              reviewedAt: "2026-07-21T09:00:00.000Z",
            },
            requestId: "review-race",
          }),
        );
      }
      return Promise.resolve(Response.json(detailEnvelope()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillRegistryPanel
        actorUserId={REVIEWER_ID}
        canRead
        initialPermissions={{ ...readOnlyPermissions, canReview: true }}
        initialSnapshot={snapshot}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "查看审核详情 safe-review" }),
    );
    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));
    fireEvent.click(screen.getByRole("button", { name: "打开审核操作" }));
    for (const label of [
      "已逐项审阅内容和文件",
      "已确认使用权和许可证",
      "已评估并接受执行风险",
      "确认审核人与创建者相互独立",
    ]) {
      fireEvent.click(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByRole("button", { name: "批准发布" }));
    await waitFor(() =>
      expect(screen.getAllByText("published").length).toBeGreaterThan(0),
    );
    const listRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("?limit=25"),
    );
    expect(listRequest?.[1]?.signal?.aborted).toBe(true);

    staleList.resolve(Response.json(listEnvelope(list.skills)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getAllByText("published").length).toBeGreaterThan(0);
    expect(screen.queryByText("pending_review")).toBeNull();
  });

  it("closes stale detail when refresh reports a changed revision state", async () => {
    const publishedSkills = list.skills.map((skill) => ({
      ...skill,
      revision:
        skill.revision === null
          ? null
          : {
              ...skill.revision,
              state: "published" as const,
              reviewedBy: REVIEWER_ID,
              reviewedAt: "2026-07-21T09:00:00.000Z",
            },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("?limit=25")
          ? Promise.resolve(Response.json(listEnvelope(publishedSkills)))
          : Promise.resolve(Response.json(detailEnvelope())),
      ),
    );
    render(
      <AssistantSkillRegistryPanel
        actorUserId={REVIEWER_ID}
        canRead
        initialPermissions={{ ...readOnlyPermissions, canReview: true }}
        initialSnapshot={snapshot}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "查看审核详情 safe-review" }),
    );
    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Revision 审核详情" }),
      ).toBeNull(),
    );
  });
});
