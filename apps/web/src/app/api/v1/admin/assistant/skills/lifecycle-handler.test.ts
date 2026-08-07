import { describe, expect, it, vi } from "vitest";

import { createSkillLifecycleHandler } from "./lifecycle-handler";

const SKILL_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const INTERNAL_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "a".repeat(64);

describe("simple Skill lifecycle handler", () => {
  it("deactivates an enabled Skill before archiving it", async () => {
    const applySkillSet = vi.fn().mockResolvedValue({ activationVersion: 8 });
    const archiveSkill = vi.fn().mockResolvedValue(undefined);
    const handler = createSkillLifecycleHandler("delete", {
      requestIdFactory: () => INTERNAL_ID,
      commands: {
        authorize: vi.fn().mockResolvedValue({
          actor: { userId: SKILL_ID, permissions: [] },
          assuredAt: 2_000_000_000,
        }),
        applySkillSet,
      } as never,
      registry: {
        listSkills: vi.fn().mockResolvedValue({
          version: "1",
          skills: [
            {
              id: SKILL_ID,
              name: "safe-skill",
              description: "Safe",
              enabled: true,
              uploadedAt: "2026-08-07T00:00:00.000Z",
              replacementToken: TOKEN,
            },
          ],
          page: { limit: 100, offset: 0, returned: 1 },
        }),
        listAvailableRevisions: vi.fn().mockResolvedValue({
          items: [
            {
              skillId: SKILL_ID,
              revisionId: REVISION_ID,
              slug: "safe-skill",
              revisionNo: 1,
              artifactSha256: TOKEN,
              extractedSize: 1,
            },
          ],
          limit: 100,
          offset: 0,
          total: 1,
        }),
        runtimeStatus: vi.fn().mockResolvedValue({
          active: {
            id: INTERNAL_ID,
            state: "active",
            revisionIds: [REVISION_ID],
            itemCount: 1,
            totalExtractedSize: 1,
            failureCode: null,
          },
          previous: null,
          activationVersion: 7,
          candidateCount: 0,
          candidates: [],
        }),
        archiveSkill,
      } as never,
    });

    const response = await handler(
      new Request("https://admin.example.test/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: REQUEST_ID }),
      }),
      { params: Promise.resolve({ skillId: SKILL_ID }) },
    );

    expect(response.status).toBe(200);
    expect(applySkillSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: "delete",
        skillId: SKILL_ID,
        expectedActivationVersion: 7,
        nextRevisionIds: [],
        requestId: REQUEST_ID,
      }),
    );
    expect(archiveSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: SKILL_ID,
        expectedArtifactSha256: TOKEN,
      }),
    );
    expect(applySkillSet.mock.invocationCallOrder[0]).toBeLessThan(
      archiveSkill.mock.invocationCallOrder[0]!,
    );
  });
});
