import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantSkillRegistryPanel } from "./assistant-skill-registry-panel";

afterEach(cleanup);

describe("AssistantSkillRegistryPanel", () => {
  it("shows an uploaded revision as available without review controls", () => {
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
              createdAt: "2026-07-21T08:00:00.000Z",
              revision: {
                id: "44444444-4444-4444-8444-444444444444",
                number: 1,
                state: "published",
                sourceType: "upload",
                artifactSha256Prefix: "aaaaaaaaaaaa",
                createdBy: "11111111-1111-4111-8111-111111111111",
                createdAt: "2026-07-21T08:00:00.000Z",
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("可启用")).toBeVisible();
    expect(screen.queryByText(/审核/u)).toBeNull();
  });
});
