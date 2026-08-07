import { describe, expect, it } from "vitest";

import {
  ADMIN_SKILL_REVISION_STATES,
  parseAdminSkillListResponse,
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

  it("accepts only the Skill-level library shape", () => {
    const skill = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "safe-skill",
      description: "A safe skill.",
      enabled: true,
      uploadedAt: "2026-07-21T08:00:00.000Z",
      replacementToken: "a".repeat(64),
    };
    const response = {
      version: "1",
      skills: [skill],
      page: { limit: 25, offset: 0, returned: 1 },
    };

    expect(parseAdminSkillListResponse(response)?.skills).toEqual([skill]);
    expect(
      parseAdminSkillListResponse({
        ...response,
        skills: [{ ...skill, revision: { number: 1 } }],
      }),
    ).toBeNull();
  });
});
