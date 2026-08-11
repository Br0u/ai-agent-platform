import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantSkillRegistryPanel } from "./assistant-skill-registry-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const enabledSkill = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "safe-skill",
  description: "A safe skill.",
  enabled: true,
  uploadedAt: "2026-07-21T08:00:00.000Z",
  replacementToken: "a".repeat(64),
  revisionId: "44444444-4444-4444-8444-444444444444",
};
const secondSkill = {
  ...enabledSkill,
  id: "55555555-5555-4555-8555-555555555555",
  name: "second-skill",
  enabled: false,
  revisionId: "66666666-6666-4666-8666-666666666666",
};
const replacementRevisionId = "77777777-7777-4777-8777-777777777777";

describe("AssistantSkillRegistryPanel", () => {
  it("shows one clean Skill row without revision or candidate controls", () => {
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{
          capability: "available",
          skills: [enabledSkill],
        }}
      />,
    );

    expect(screen.getByText("● 已启用")).toBeVisible();
    expect(screen.getByText("A safe skill.")).toBeVisible();
    expect(
      screen.getByText("上传时间：2026-07-21T08:00:00.000Z"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "停用" })).toBeVisible();
    expect(screen.getByRole("button", { name: "删除" })).toBeVisible();
    expect(screen.queryByText(/revision/u)).toBeNull();
    expect(screen.queryByText(/候选/u)).toBeNull();
    expect(screen.queryByText(/审核/u)).toBeNull();
  });

  it("locks the affected Skill when mutation outcome cannot be confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "44444444-4444-4444-8444-444444444444",
              error: { code: "result_unknown" },
            },
            { status: 503 },
          ),
        )
        .mockRejectedValueOnce(new Error("refresh failed")),
    );
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{ capability: "available", skills: [enabledSkill] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "操作结果正在确认，请刷新后再试。",
      ),
    );
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });

  it.each([
    {
      operation: "停用",
      initial: enabledSkill,
      stale: enabledSkill,
      converged: { ...enabledSkill, enabled: false },
      nextOperation: "启用",
    },
    {
      operation: "启用",
      initial: secondSkill,
      stale: secondSkill,
      converged: { ...secondSkill, enabled: true },
      nextOperation: "停用",
    },
  ])(
    "keeps an unknown $operation locked until the exact enabled state is observed",
    async ({ operation, initial, stale, converged, nextOperation }) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            Response.json(
              {
                version: "1",
                requestId: "unknown",
                error: { code: "result_unknown" },
              },
              { status: 503 },
            ),
          )
          .mockResolvedValueOnce(
            Response.json({
              version: "1",
              skills: [stale],
              page: { limit: 100, offset: 0, returned: 1 },
              requestId: "stale",
              permissions: {
                canUpload: true,
                canManageConnections: false,
                canConfigure: true,
              },
            }),
          )
          .mockResolvedValueOnce(
            Response.json({
              version: "1",
              skills: [converged],
              page: { limit: 100, offset: 0, returned: 1 },
              requestId: "converged",
              permissions: {
                canUpload: true,
                canManageConnections: false,
                canConfigure: true,
              },
            }),
          ),
      );
      render(
        <AssistantSkillRegistryPanel
          canRead
          initialPermissions={{
            canUpload: true,
            canManageConnections: false,
            canConfigure: true,
          }}
          initialSnapshot={{ capability: "available", skills: [initial] }}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: operation }));

      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "操作结果正在确认，请刷新后再试。",
        ),
      );
      expect(screen.getByRole("button", { name: operation })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: nextOperation }),
        ).toBeEnabled(),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Skill 状态已确认。",
      );
    },
  );

  it("refreshes authoritative state before unlocking an unknown replacement", async () => {
    let resolveRefresh!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "conflict",
              error: { code: "state_conflict" },
              conflictingSkillId: enabledSkill.id,
              replacementToken: "a".repeat(64),
              conflictingSkillEnabled: true,
            },
            { status: 409 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "unknown",
              error: { code: "result_unknown" },
            },
            { status: 503 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            skills: Array.from({ length: 100 }, (_, index) => ({
              ...enabledSkill,
              id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              name: `other-skill-${index}`,
            })),
            page: { limit: 100, offset: 0, returned: 100 },
            requestId: "refresh-first-page",
            permissions: {
              canUpload: true,
              canManageConnections: false,
              canConfigure: true,
            },
          }),
        )
        .mockReturnValueOnce(refresh),
    );
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{ capability: "available", skills: [enabledSkill] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/admin/assistant/skills?limit=100&offset=0",
      expect.anything(),
    );
    resolveRefresh!(
      Response.json({
        version: "1",
        skills: [{ ...enabledSkill, revisionId: replacementRevisionId }],
        page: { limit: 100, offset: 100, returned: 1 },
        requestId: "refresh",
        permissions: {
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "停用" })).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Skill 状态已确认。");
  });

  it("keeps replacement controls locked until a new enabled revision is observed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "conflict",
              error: { code: "state_conflict" },
              conflictingSkillId: enabledSkill.id,
              replacementToken: "a".repeat(64),
              conflictingSkillEnabled: true,
            },
            { status: 409 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "unknown",
              error: { code: "result_unknown" },
            },
            { status: 503 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            skills: [enabledSkill],
            page: { limit: 100, offset: 0, returned: 1 },
            requestId: "old-revision",
            permissions: {
              canUpload: true,
              canManageConnections: false,
              canConfigure: true,
            },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            skills: [{ ...enabledSkill, revisionId: replacementRevisionId }],
            page: { limit: 100, offset: 0, returned: 1 },
            requestId: "replacement-observed",
            permissions: {
              canUpload: true,
              canManageConnections: false,
              canConfigure: true,
            },
          }),
        ),
    );
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{ capability: "available", skills: [enabledSkill] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "操作结果正在确认，请刷新后再试。",
      ),
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "刷新 Skill 列表" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "上传 Skill ZIP" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "停用" })).toBeEnabled();
  });

  it("reconciles an unknown replacement whose target is on a later page", async () => {
    let uploadCalls = 0;
    let listRound = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/skills/uploads")) {
        uploadCalls += 1;
        return uploadCalls === 1
          ? Response.json(
              {
                version: "1",
                requestId: "conflict",
                error: { code: "state_conflict" },
                conflictingSkillId: enabledSkill.id,
                replacementToken: enabledSkill.replacementToken,
                conflictingSkillEnabled: true,
              },
              { status: 409 },
            )
          : Response.json(
              {
                version: "1",
                requestId: "unknown",
                error: { code: "result_unknown" },
              },
              { status: 503 },
            );
      }
      const offset = new URL(url, "https://example.test").searchParams.get(
        "offset",
      );
      if (offset === "0") listRound += 1;
      const skills =
        offset === "0"
          ? Array.from({ length: 100 }, (_, index) => ({
              ...secondSkill,
              id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              name: `other-skill-${index}`,
            }))
          : [
              listRound === 1
                ? enabledSkill
                : { ...enabledSkill, revisionId: replacementRevisionId },
            ];
      return Response.json({
        version: "1",
        skills,
        page: {
          limit: 100,
          offset: Number(offset),
          returned: skills.length,
        },
        requestId: `list-${listRound}-${offset}`,
        permissions: {
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        },
      });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", fetcher);
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{ capability: "available", skills: [secondSkill] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Skill 状态已确认。",
      ),
    );
    expect(listRound).toBe(2);
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeEnabled();
  });

  it("keeps replacement controls locked when target confirmation fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "conflict",
              error: { code: "state_conflict" },
              conflictingSkillId: enabledSkill.id,
              replacementToken: "a".repeat(64),
              conflictingSkillEnabled: true,
            },
            { status: 409 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "unknown",
              error: { code: "result_unknown" },
            },
            { status: 503 },
          ),
        )
        .mockRejectedValueOnce(new Error("Registry unavailable")),
    );
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{ capability: "available", skills: [enabledSkill] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "操作结果正在确认，请刷新后再试。",
      ),
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "刷新 Skill 列表" }),
    ).toBeEnabled();
  });

  it("keeps unknown replacement A locked when mutation B is attempted", async () => {
    let uploadCalls = 0;
    let exactConfirmationCalls = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/${secondSkill.id}/enable`))
        return Response.json({ version: "1" });
      if (url.endsWith("/skills/uploads")) {
        uploadCalls += 1;
        return uploadCalls === 1
          ? Response.json(
              {
                version: "1",
                requestId: "conflict",
                error: { code: "state_conflict" },
                conflictingSkillId: enabledSkill.id,
                replacementToken: "a".repeat(64),
                conflictingSkillEnabled: true,
              },
              { status: 409 },
            )
          : Response.json(
              {
                version: "1",
                requestId: "unknown",
                error: { code: "result_unknown" },
              },
              { status: 503 },
            );
      }
      if (url.includes("limit=100")) {
        exactConfirmationCalls += 1;
        return Response.json({
          version: "1",
          skills:
            exactConfirmationCalls === 1
              ? []
              : [{ ...enabledSkill, revisionId: replacementRevisionId }],
          page: {
            limit: 100,
            offset: 0,
            returned: exactConfirmationCalls === 1 ? 0 : 1,
          },
          requestId: `confirm-${exactConfirmationCalls}`,
          permissions: {
            canUpload: true,
            canManageConnections: false,
            canConfigure: true,
          },
        });
      }
      return Response.json({
        version: "1",
        skills: [enabledSkill, secondSkill],
        page: { limit: 25, offset: 0, returned: 2 },
        requestId: "ordinary-refresh",
        permissions: {
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        },
      });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", fetcher);
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{
          capability: "available",
          skills: [enabledSkill, secondSkill],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "操作结果正在确认，请刷新后再试。",
      ),
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用" })).toBeDisabled();

    const callsBeforeMutationAttempt = fetcher.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "启用" }));
    expect(fetcher).toHaveBeenCalledTimes(callsBeforeMutationAttempt);
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Skill 列表" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "上传 Skill ZIP" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "停用" })).toBeEnabled();
  });

  it("unlocks an unknown delete only after the terminal authoritative page confirms absence", async () => {
    let resolveTerminalPage!: (response: Response) => void;
    const terminalPage = new Promise<Response>((resolve) => {
      resolveTerminalPage = resolve;
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "delete-unknown",
              error: { code: "result_unknown" },
            },
            { status: 503 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            skills: Array.from({ length: 100 }, (_, index) => ({
              ...enabledSkill,
              id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              name: `other-skill-${index}`,
            })),
            page: { limit: 100, offset: 0, returned: 100 },
            requestId: "delete-first-page",
            permissions: {
              canUpload: true,
              canManageConnections: false,
              canConfigure: true,
            },
          }),
        )
        .mockReturnValueOnce(terminalPage),
    );
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{ capability: "available", skills: [enabledSkill] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        "/api/v1/admin/assistant/skills?limit=100&offset=100",
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();

    resolveTerminalPage!(
      Response.json({
        version: "1",
        skills: [],
        page: { limit: 100, offset: 100, returned: 0 },
        requestId: "delete-confirmed-absent",
        permissions: {
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        },
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText(enabledSkill.name)).not.toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/assistant/skills?limit=100&offset=0",
      expect.anything(),
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeEnabled();
  });

  it("keeps an unknown delete unresolved when a later page still contains the target", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              version: "1",
              requestId: "delete-unknown",
              error: { code: "result_unknown" },
            },
            { status: 503 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            skills: Array.from({ length: 100 }, (_, index) => ({
              ...enabledSkill,
              id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              name: `other-skill-${index}`,
            })),
            page: { limit: 100, offset: 0, returned: 100 },
            requestId: "delete-first-page",
            permissions: {
              canUpload: true,
              canManageConnections: false,
              canConfigure: true,
            },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            version: "1",
            skills: [enabledSkill],
            page: { limit: 100, offset: 100, returned: 1 },
            requestId: "delete-target-still-present",
            permissions: {
              canUpload: true,
              canManageConnections: false,
              canConfigure: true,
            },
          }),
        ),
    );
    render(
      <AssistantSkillRegistryPanel
        canRead
        initialPermissions={{
          canUpload: true,
          canManageConnections: false,
          canConfigure: true,
        }}
        initialSnapshot={{
          capability: "available",
          skills: [enabledSkill, secondSkill],
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() =>
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        "/api/v1/admin/assistant/skills?limit=100&offset=100",
        expect.anything(),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "操作结果正在确认，请刷新后再试。",
    );
    expect(
      screen.getByRole("button", { name: "上传 Skill ZIP" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用" })).toBeDisabled();
    const deleteButtons = screen.getAllByRole("button", { name: "删除" });
    expect(deleteButtons).toHaveLength(2);
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).toBeDisabled();
    const callsBeforeDeleteAttempt = vi.mocked(fetch).mock.calls.length;
    deleteButtons[1].click();
    expect(fetch).toHaveBeenCalledTimes(callsBeforeDeleteAttempt);
    expect(
      screen.getByRole("button", { name: "刷新 Skill 列表" }),
    ).toBeEnabled();
  });
});
