import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminSkillRevision } from "@/features/assistant/admin-skill-contract";
import { AssistantSkillReviewDialog } from "./assistant-skill-review-dialog";

const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const CREATOR_ID = "11111111-1111-4111-8111-111111111111";

const revision = {
  id: REVISION_ID,
  skillId: SKILL_ID,
  name: "safe-review",
  number: 2,
  state: "pending_review",
  sourceType: "upload",
  artifactSha256: "a".repeat(64),
  createdBy: CREATOR_ID,
  createdAt: "2026-07-21T08:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
} satisfies AdminSkillRevision;

const attestationLabels = [
  "已逐项审阅内容和文件",
  "已确认使用权和许可证",
  "已评估并接受执行风险",
  "确认审核人与创建者相互独立",
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSkillReviewDialog", () => {
  it("requires all four attestations before approval", async () => {
    const onReviewed = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          version: "1",
          revision: {
            ...revision,
            state: "published",
            reviewedBy: "22222222-2222-4222-8222-222222222222",
            reviewedAt: "2026-07-21T09:00:00.000Z",
          },
          requestId: "trace-review",
        }),
      ),
    );
    render(
      <AssistantSkillReviewDialog
        actorUserId="22222222-2222-4222-8222-222222222222"
        onClose={vi.fn()}
        onReviewed={onReviewed}
        revision={revision}
      />,
    );

    const approve = screen.getByRole("button", { name: "批准发布" });
    expect(screen.getByLabelText(attestationLabels[0]!)).toHaveFocus();
    expect(approve).toBeDisabled();
    for (const label of attestationLabels)
      fireEvent.click(screen.getByLabelText(label));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);

    await waitFor(() => expect(onReviewed).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("published");
  });

  it("hides approval from the creator and requires a trimmed rejection reason", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillReviewDialog
        actorUserId={CREATOR_ID}
        onClose={vi.fn()}
        onReviewed={vi.fn()}
        revision={revision}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "批准发布" }),
    ).not.toBeInTheDocument();
    for (const label of attestationLabels)
      fireEvent.click(screen.getByLabelText(label));
    fireEvent.change(screen.getByLabelText("拒绝原因"), {
      target: { value: "  模糊  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "拒绝 revision" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/首尾空格/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a valid rejection reason with the four confirmed attestations", async () => {
    const onReviewed = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        version: "1",
        revision: {
          ...revision,
          state: "rejected",
          reviewedBy: "22222222-2222-4222-8222-222222222222",
          reviewedAt: "2026-07-21T09:00:00.000Z",
        },
        requestId: "trace-reject",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillReviewDialog
        actorUserId="22222222-2222-4222-8222-222222222222"
        onClose={vi.fn()}
        onReviewed={onReviewed}
        revision={revision}
      />,
    );

    for (const label of attestationLabels)
      fireEvent.click(screen.getByLabelText(label));
    fireEvent.change(screen.getByLabelText("拒绝原因"), {
      target: { value: "依赖不在运行时允许列表" },
    });
    fireEvent.click(screen.getByRole("button", { name: "拒绝 revision" }));

    await waitFor(() => expect(onReviewed).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `/skills/${SKILL_ID}/revisions/${REVISION_ID}/review`,
      ),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("依赖不在运行时允许列表"),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("rejected");
  });
});
