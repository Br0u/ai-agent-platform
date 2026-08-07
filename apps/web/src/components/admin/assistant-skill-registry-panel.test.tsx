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
});
