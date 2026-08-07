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
    expect(screen.getByRole("button", { name: "停用" })).toBeVisible();
    expect(screen.getByRole("button", { name: "删除" })).toBeVisible();
    expect(screen.queryByText(/revision/u)).toBeNull();
    expect(screen.queryByText(/候选/u)).toBeNull();
    expect(screen.queryByText(/审核/u)).toBeNull();
  });

  it("navigates only for the exact versioned re-auth response", async () => {
    const navigateToReauth = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            version: "1",
            requestId: "44444444-4444-4444-8444-444444444444",
            error: { code: "reauth_required" },
            redirectTo: "/staff/re-auth",
          },
          { status: 401 },
        ),
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
        navigateToReauth={navigateToReauth}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    await waitFor(() =>
      expect(navigateToReauth).toHaveBeenCalledExactlyOnceWith(
        "/staff/re-auth",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "需要重新验证身份，正在前往验证页面。",
    );
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
        skills: [enabledSkill],
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

  it("keeps replacement controls locked when the target is absent until Refresh observes it", async () => {
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
            skills: [],
            page: { limit: 100, offset: 0, returned: 0 },
            requestId: "target-absent",
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
            page: { limit: 100, offset: 0, returned: 1 },
            requestId: "target-observed",
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

  it("sends a confirmed replacement re-auth response to the exact staff route", async () => {
    const navigateToReauth = vi.fn();
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
              requestId: "reauth",
              error: { code: "reauth_required" },
              redirectTo: "/staff/re-auth",
            },
            { status: 401 },
          ),
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
        navigateToReauth={navigateToReauth}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上传 Skill ZIP" }));
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() =>
      expect(navigateToReauth).toHaveBeenCalledExactlyOnceWith(
        "/staff/re-auth",
      ),
    );
  });
});
