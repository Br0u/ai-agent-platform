import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminSkillRevisionDetailResponse } from "@/features/assistant/admin-skill-contract";
import { AssistantSkillRevisionDetail } from "./assistant-skill-revision-detail";

const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const SKILL_ID_B = "77777777-7777-4777-8777-777777777777";
const REVISION_ID_B = "88888888-8888-4888-8888-888888888888";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const detail = {
  version: "1",
  revision: {
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
    description: "<b>只显示纯文本</b>",
    license: "Apache-2.0",
    compatibility: "Agno 2.7.2",
    allowedTools: ["web_search"],
    compressedSize: 100,
    extractedSize: 22,
    fileCount: 2,
  },
  files: [
    {
      path: "SKILL.md",
      sha256: "b".repeat(64),
      size: 12,
      mediaType: "text/markdown",
      kind: "manifest",
    },
    {
      path: "scripts/run.py",
      sha256: "c".repeat(64),
      size: 10,
      mediaType: "text/x-python",
      kind: "script",
    },
  ],
  dependencies: {
    pythonModules: ["requests"],
    unavailablePythonModules: ["requests"],
  },
  findings: [
    {
      path: "scripts/run.py",
      line: 1,
      code: "unsupported_import",
      message: "requests is not permitted",
      blocking: true,
    },
  ],
  previousPublishedRevisionId: "55555555-5555-4555-8555-555555555555",
  diff: {
    truncated: false,
    files: [
      {
        path: "scripts/run.py",
        status: "modified",
        binary: false,
        diff: "-old\n+new",
      },
    ],
  },
  reviewAttestations: {
    contentReviewed: true,
    usageRightsConfirmed: true,
    executionRiskAccepted: true,
    independentReviewerConfirmed: true,
  },
} satisfies AdminSkillRevisionDetailResponse;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSkillRevisionDetail", () => {
  it("renders the safe review evidence and opens files as plain text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...detail, requestId: "trace-detail" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          path: "SKILL.md",
          content: "# Safe\n<script>alert(1)</script>",
          requestId: "trace-file",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );

    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    expect(screen.getByText(/requests is not permitted/u)).toBeVisible();
    expect(screen.getAllByText(/scripts\/run\.py/u).length).toBeGreaterThan(0);
    expect(screen.getByText("a".repeat(64))).toBeVisible();
    expect(screen.getByText(/前一已发布版本/u)).toBeVisible();
    expect(screen.getByText(/-old\s+\+new/u)).toBeVisible();
    expect(screen.getByText("差异截断：否")).toBeVisible();
    expect(screen.getByText("<b>只显示纯文本</b>")).toBeVisible();
    expect(document.querySelector("b")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "查看文件 SKILL.md" }));
    const viewer = await screen.findByTestId("assistant-skill-file-viewer");
    expect(viewer.tagName).toBe("PRE");
    expect(viewer).toHaveTextContent("<script>alert(1)</script>");
    expect(viewer.querySelector("script")).toBeNull();
  });

  it("keeps the last detail when a retry fails and announces degradation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...detail, requestId: "first" }))
        .mockResolvedValueOnce(new Response("bad", { status: 503 })),
    );
    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );
    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重新加载审核详情" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /详情加载失败.*旧数据/u,
      ),
    );
    expect(screen.getByText("Apache-2.0")).toBeVisible();
  });

  it("aborts an obsolete detail request and ignores its late response", async () => {
    const detailA = deferred<Response>();
    const detailB = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      return String(input).includes(REVISION_ID_B)
        ? detailB.promise
        : detailA.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal;

    view.rerender(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID_B}
        skillId={SKILL_ID_B}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    detailB.resolve(
      Response.json({
        ...detail,
        revision: {
          ...detail.revision,
          id: REVISION_ID_B,
          skillId: SKILL_ID_B,
          name: "new-review",
          license: "MIT",
        },
        requestId: "detail-b",
      }),
    );
    expect(await screen.findByText("MIT")).toBeVisible();

    detailA.resolve(Response.json({ ...detail, requestId: "late-detail-a" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("MIT")).toBeVisible();
    expect(screen.queryByText("Apache-2.0")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("aborts an obsolete file request and ignores its late response", async () => {
    const fileA = deferred<Response>();
    const fileB = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const url = String(input);
      if (url.endsWith("/files/SKILL.md")) return fileA.promise;
      if (url.endsWith("/files/scripts/run.py")) return fileB.promise;
      return Promise.resolve(
        Response.json({ ...detail, requestId: "detail-files" }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );
    expect(await screen.findByText("Apache-2.0")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "查看文件 SKILL.md" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstFileSignal = fetchMock.mock.calls[1]?.[1]?.signal;
    fireEvent.click(
      screen.getByRole("button", { name: "查看文件 scripts/run.py" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(firstFileSignal?.aborted).toBe(true);

    fileB.resolve(
      Response.json({
        version: "1",
        path: "scripts/run.py",
        content: "new file B",
        requestId: "file-b",
      }),
    );
    expect(await screen.findByText("new file B")).toBeVisible();
    fileA.resolve(
      Response.json({
        version: "1",
        path: "SKILL.md",
        content: "late file A",
        requestId: "file-a",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("new file B")).toBeVisible();
    expect(screen.queryByText("late file A")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the creator a read-only independent-review requirement", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ...detail, requestId: "creator-detail" }),
        ),
    );
    render(
      <AssistantSkillRevisionDetail
        actorUserId={CREATOR_ID}
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );

    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    expect(screen.getByText(/需独立审核人/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "打开审核操作" })).toBeNull();
  });

  it("closes review actions after publication and exposes the new textual state", async () => {
    const onRevisionChanged = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            ...detail,
            findings: [],
            requestId: "detail-review",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            revision: {
              id: REVISION_ID,
              skillId: SKILL_ID,
              name: "safe-review",
              number: 2,
              state: "published",
              sourceType: "upload",
              artifactSha256: "a".repeat(64),
              createdBy: CREATOR_ID,
              createdAt: "2026-07-21T08:00:00.000Z",
              reviewedBy: "22222222-2222-4222-8222-222222222222",
              reviewedAt: "2026-07-21T09:00:00.000Z",
            },
            requestId: "published-review",
          }),
        ),
    );
    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={onRevisionChanged}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );

    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    const reviewTrigger = screen.getByRole("button", { name: "打开审核操作" });
    fireEvent.click(reviewTrigger);
    for (const label of [
      "已逐项审阅内容和文件",
      "已确认使用权和许可证",
      "已评估并接受执行风险",
      "确认审核人与创建者相互独立",
    ]) {
      fireEvent.click(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByRole("button", { name: "批准发布" }));

    await waitFor(() => expect(onRevisionChanged).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/当前状态：published/u)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "审核完成，状态：published。",
    );
    await waitFor(() => expect(reviewTrigger).toHaveFocus());
  });

  it("keeps a successful review when an older detail reload resolves late", async () => {
    const staleReload = deferred<Response>();
    const onRevisionChanged = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...detail,
          findings: [],
          requestId: "detail-before-review-race",
        }),
      )
      .mockReturnValueOnce(staleReload.promise)
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          revision: {
            id: REVISION_ID,
            skillId: SKILL_ID,
            name: "safe-review",
            number: 2,
            state: "published",
            sourceType: "upload",
            artifactSha256: "a".repeat(64),
            createdBy: CREATOR_ID,
            createdAt: "2026-07-21T08:00:00.000Z",
            reviewedBy: "22222222-2222-4222-8222-222222222222",
            reviewedAt: "2026-07-21T09:00:00.000Z",
          },
          requestId: "review-wins-race",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={onRevisionChanged}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );

    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重新加载审核详情" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const staleSignal = (fetchMock.mock.calls[1]?.[1] as RequestInit).signal;
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
    await waitFor(() => expect(onRevisionChanged).toHaveBeenCalledOnce());

    staleReload.resolve(
      Response.json({
        ...detail,
        findings: [],
        requestId: "late-pending-detail",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(staleSignal?.aborted).toBe(true);
    expect(screen.getAllByText("published").length).toBeGreaterThan(0);
    expect(screen.queryByText("pending_review")).toBeNull();
    expect(
      screen.getByRole("button", { name: "打开审核操作" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "审核完成，状态：published。",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [
      "Escape",
      (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: "Escape" }),
    ],
    [
      "取消按钮",
      () => fireEvent.click(screen.getByRole("button", { name: "关闭" })),
    ],
  ])("restores focus to the review trigger after %s", async (_name, close) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...detail,
          findings: [],
          requestId: "detail-close",
        }),
      ),
    );
    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={vi.fn()}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );

    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    const reviewTrigger = screen.getByRole("button", { name: "打开审核操作" });
    fireEvent.click(reviewTrigger);
    const dialog = screen.getByRole("dialog");
    close(dialog);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(reviewTrigger).toHaveFocus());
  });

  it("keeps a failed review dialog open without moving focus back to the trigger", async () => {
    const onRevisionChanged = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            ...detail,
            findings: [],
            requestId: "detail-failed-review",
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );
    render(
      <AssistantSkillRevisionDetail
        actorUserId="22222222-2222-4222-8222-222222222222"
        onRevisionChanged={onRevisionChanged}
        revisionId={REVISION_ID}
        skillId={SKILL_ID}
      />,
    );

    expect(await screen.findByText("Apache-2.0")).toBeVisible();
    const reviewTrigger = screen.getByRole("button", { name: "打开审核操作" });
    fireEvent.click(reviewTrigger);
    for (const label of [
      "已逐项审阅内容和文件",
      "已确认使用权和许可证",
      "已评估并接受执行风险",
      "确认审核人与创建者相互独立",
    ]) {
      fireEvent.click(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByRole("button", { name: "批准发布" }));

    expect(await screen.findByText(/审核失败；旧状态已保留/u)).toBeVisible();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(reviewTrigger).not.toHaveFocus();
    expect(onRevisionChanged).not.toHaveBeenCalled();
  });
});
