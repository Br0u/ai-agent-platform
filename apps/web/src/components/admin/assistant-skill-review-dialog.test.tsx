import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useLayoutEffect, useRef, useState } from "react";

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

type ModalSettledState = {
  ariaHidden: boolean;
  backgroundClickBlocked: boolean;
  inert: boolean;
  portalPresent: boolean;
  status: string;
};

function StrictReviewLifecycleHarness({
  onSettled,
}: {
  onSettled(state: ModalSettledState): void;
}) {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState("");
  const background = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const target = background.current;
    if (open || target === null) return;
    let clicked = false;
    const recordClick = () => {
      clicked = true;
    };
    target.addEventListener("click", recordClick, { once: true });
    target.click();
    target.removeEventListener("click", recordClick);
    onSettled({
      ariaHidden: target.closest('[aria-hidden="true"]') !== null,
      backgroundClickBlocked: !clicked,
      inert: target.closest("[inert]") !== null,
      portalPresent: document.querySelector(".assistant-skill-dialog") !== null,
      status,
    });
  }, [onSettled, open, status]);

  return (
    <div>
      <p aria-live="polite" role="status">
        {status}
      </p>
      <button ref={background} type="button">
        背景操作
      </button>
      <button onClick={() => setOpen(true)} type="button">
        再次打开审核
      </button>
      {open ? (
        <AssistantSkillReviewDialog
          actorUserId="22222222-2222-4222-8222-222222222222"
          findings={[]}
          onClose={() => setOpen(false)}
          onReviewed={(reviewed) => {
            setStatus(`父级已确认：${reviewed.state}`);
            setOpen(false);
          }}
          revision={revision}
        />
      ) : null}
    </div>
  );
}

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
        findings={[]}
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

  it("prevents the creator from making any review decision or attestation", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillReviewDialog
        actorUserId={CREATOR_ID}
        findings={[]}
        onClose={vi.fn()}
        onReviewed={vi.fn()}
        revision={revision}
      />,
    );

    expect(screen.getByText(/需独立审核人/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "批准发布" })).toBeNull();
    expect(screen.queryByRole("button", { name: "拒绝 revision" })).toBeNull();
    expect(screen.queryByLabelText(attestationLabels[3]!)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["private_key", false, "private key material"],
    ["unsupported_import", true, "module is not permitted"],
  ] as const)(
    "allows only rejection for Registry blocker %s even when DTO blocking is %s",
    (code, blocking, message) => {
      vi.stubGlobal("fetch", vi.fn());
      render(
        <AssistantSkillReviewDialog
          actorUserId="22222222-2222-4222-8222-222222222222"
          findings={[
            {
              path: "scripts/run.py",
              line: 7,
              code,
              message,
              blocking,
            },
          ]}
          onClose={vi.fn()}
          onReviewed={vi.fn()}
          revision={revision}
        />,
      );

      expect(screen.queryByRole("button", { name: "批准发布" })).toBeNull();
      expect(
        screen.getByRole("button", { name: "拒绝 revision" }),
      ).toBeVisible();
      expect(screen.getByText(/scripts\/run\.py:7/u)).toBeVisible();
      expect(screen.getByText(new RegExp(message, "u"))).toBeVisible();
      expect(screen.getByText(/阻断.*不能批准/u)).toBeVisible();
    },
  );

  it("does not block approval for an ordinary non-blocking external URL", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <AssistantSkillReviewDialog
        actorUserId="22222222-2222-4222-8222-222222222222"
        findings={[
          {
            path: "SKILL.md",
            line: 2,
            code: "external_url",
            message: "review the documented source URL",
            blocking: false,
          },
        ]}
        onClose={vi.fn()}
        onReviewed={vi.fn()}
        revision={revision}
      />,
    );

    for (const label of attestationLabels)
      fireEvent.click(screen.getByLabelText(label));
    expect(screen.getByRole("button", { name: "批准发布" })).toBeEnabled();
    expect(screen.queryByText(/阻断.*不能批准/u)).toBeNull();
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
        findings={[]}
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

  it("traps forward and reverse focus while blocking the background", () => {
    const backgroundClick = vi.fn();
    const view = render(
      <>
        <button onClick={backgroundClick} type="button">
          背景审核操作
        </button>
        <AssistantSkillReviewDialog
          actorUserId="22222222-2222-4222-8222-222222222222"
          findings={[]}
          onClose={vi.fn()}
          onReviewed={vi.fn()}
          revision={revision}
        />
      </>,
    );

    for (const label of attestationLabels)
      fireEvent.click(screen.getByLabelText(label));
    const dialog = screen.getByRole("dialog");
    const first = screen.getByRole("button", { name: "关闭" });
    const last = screen.getByRole("button", { name: "拒绝 revision" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    expect(view.container).toHaveAttribute("inert");
    const background = screen.getByRole("button", {
      name: "背景审核操作",
      hidden: true,
    });
    background.focus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.click(background);
    expect(backgroundClick).not.toHaveBeenCalled();
  });

  it("restores the parent synchronously across consecutive StrictMode success cycles", async () => {
    const reviews = [0, 1].map(() => {
      let resolve!: (response: Response) => void;
      const promise = new Promise<Response>((next) => {
        resolve = next;
      });
      return { promise, resolve };
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(reviews[0]!.promise)
      .mockReturnValueOnce(reviews[1]!.promise);
    const onSettled = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StrictMode>
        <StrictReviewLifecycleHarness onSettled={onSettled} />
      </StrictMode>,
    );

    for (let cycle = 0; cycle < 2; cycle += 1) {
      if (cycle > 0) {
        fireEvent.click(screen.getByRole("button", { name: "再次打开审核" }));
      }
      for (const label of attestationLabels)
        fireEvent.click(screen.getByLabelText(label));
      fireEvent.click(screen.getByRole("button", { name: "批准发布" }));

      await act(async () => {
        reviews[cycle]!.resolve(
          Response.json({
            version: "1",
            revision: {
              ...revision,
              state: "published",
              reviewedBy: "22222222-2222-4222-8222-222222222222",
              reviewedAt: "2026-07-21T09:00:00.000Z",
            },
            requestId: `strict-review-${cycle}`,
          }),
        );
        await reviews[cycle]!.promise;
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(onSettled).toHaveBeenLastCalledWith({
        ariaHidden: false,
        backgroundClickBlocked: false,
        inert: false,
        portalPresent: false,
        status: "父级已确认：published",
      });
      const parentStatus = screen.getByRole("status");
      expect(parentStatus).toHaveTextContent("父级已确认：published");
      expect(parentStatus.closest('[aria-hidden="true"]')).toBeNull();
      expect(parentStatus.closest("[inert]")).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
