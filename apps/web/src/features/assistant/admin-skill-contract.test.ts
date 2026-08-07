import { describe, expect, it } from "vitest";

import {
  ADMIN_SKILL_REVISION_STATES,
  parseAdminSkillRevisionResponse,
} from "./admin-skill-contract";

describe("admin Skill contract", () => {
  it("accepts only directly available or archived revisions", () => {
    const response = {
      version: "1",
      revision: {
        id: "44444444-4444-4444-8444-444444444444",
        skillId: "33333333-3333-4333-8333-333333333333",
        name: "safe-skill",
        number: 1,
        state: "published",
        sourceType: "upload",
        artifactSha256: "a".repeat(64),
        createdBy: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-07-21T08:00:00.000Z",
      },
    };

    expect(ADMIN_SKILL_REVISION_STATES).toEqual(["published", "archived"]);
    expect(parseAdminSkillRevisionResponse(response)?.revision.state).toBe(
      "published",
    );
    expect(
      parseAdminSkillRevisionResponse({
        ...response,
        revision: { ...response.revision, state: "pending_review" },
      }),
    ).toBeNull();
  });
});
