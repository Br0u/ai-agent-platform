import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantSkillRegistryPanel } from "./assistant-skill-registry-panel";

afterEach(cleanup);

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
          skills: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "safe-skill",
              description: "A safe skill.",
              enabled: true,
              uploadedAt: "2026-07-21T08:00:00.000Z",
              replacementToken: "a".repeat(64),
            },
          ],
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
});
