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
    expect(screen.getByRole("status")).toHaveTextContent(/等待独立审核/u);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.textContent).not.toContain("已启用");
  });
});
