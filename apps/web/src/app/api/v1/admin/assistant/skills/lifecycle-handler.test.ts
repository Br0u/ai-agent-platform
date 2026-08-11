import { describe, expect, it, vi } from "vitest";

import { AuthAccessError } from "@/server/auth/access";
import { AdminSkillLifecycleCommandError } from "@/server/assistant/admin-skill-lifecycle-commands";
import { createSkillLifecycleHandler } from "./lifecycle-handler";

const SKILL_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const INTERNAL_ID = "44444444-4444-4444-8444-444444444444";
const CURRENT_REVISION_ID = "55555555-5555-4555-8555-555555555555";
const TOKEN = "a".repeat(64);

describe("simple Skill lifecycle handler", () => {
  it("returns permission denied when authorization fails", async () => {
    const handler = createSkillLifecycleHandler("disable", {
      requestIdFactory: () => INTERNAL_ID,
      commands: {
        authorize: vi
          .fn()
          .mockRejectedValue(
            new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
          ),
      } as never,
      registry: {} as never,
    });

    const response = await handler(
      new Request("https://admin.example.test/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: REQUEST_ID }),
      }),
      { params: Promise.resolve({ skillId: SKILL_ID }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: INTERNAL_ID,
      error: { code: "permission_denied" },
    });
  });

  it("distinguishes an unknown activation result from an unavailable runtime", async () => {
    const handler = createSkillLifecycleHandler("disable", {
      requestIdFactory: () => INTERNAL_ID,
      commands: {
        authorize: vi.fn().mockResolvedValue({
          actor: { userId: SKILL_ID, permissions: [] },
          assuredAt: 2_000_000_000,
        }),
        applySkillSet: vi
          .fn()
          .mockRejectedValue(
            new AdminSkillLifecycleCommandError("result_unknown"),
          ),
      } as never,
      registry: {
        listSkills: vi.fn().mockResolvedValue({
          version: "1",
          skills: [{ id: SKILL_ID, enabled: true, revisionId: REVISION_ID }],
          page: { limit: 100, offset: 0, returned: 1 },
        }),
        listAvailableRevisions: vi.fn().mockResolvedValue({
          items: [{ skillId: SKILL_ID, revisionId: REVISION_ID }],
          limit: 100,
          offset: 0,
          total: 1,
        }),
        runtimeStatus: vi.fn().mockResolvedValue({
          active: { revisionIds: [REVISION_ID] },
          activationVersion: 7,
        }),
      } as never,
    });

    const response = await handler(
      new Request("https://admin.example.test/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: REQUEST_ID }),
      }),
      { params: Promise.resolve({ skillId: SKILL_ID }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "result_unknown" },
    });
  });

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

  it("uses the authoritative current revision after a failed active replacement and paginates past 100 rows", async () => {
    const applySkillSet = vi.fn().mockResolvedValue({ activationVersion: 8 });
    const listSkills = vi
      .fn()
      .mockResolvedValueOnce({
        version: "1",
        skills: Array.from({ length: 100 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        })),
        page: { limit: 100, offset: 0, returned: 100 },
      })
      .mockResolvedValueOnce({
        version: "1",
        skills: [
          {
            id: SKILL_ID,
            enabled: true,
            revisionId: CURRENT_REVISION_ID,
            replacementToken: TOKEN,
          },
        ],
        page: { limit: 100, offset: 100, returned: 1 },
      });
    const listAvailableRevisions = vi
      .fn()
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, index) => ({
          skillId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          revisionId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        })),
        limit: 100,
        offset: 0,
        total: 102,
      })
      .mockResolvedValueOnce({
        items: [
          { skillId: SKILL_ID, revisionId: CURRENT_REVISION_ID },
          { skillId: SKILL_ID, revisionId: REVISION_ID },
        ],
        limit: 100,
        offset: 100,
        total: 102,
      });
    const handler = createSkillLifecycleHandler("enable", {
      requestIdFactory: () => INTERNAL_ID,
      commands: {
        authorize: vi.fn().mockResolvedValue({
          actor: { userId: SKILL_ID, permissions: [] },
          assuredAt: 2_000_000_000,
        }),
        applySkillSet,
      } as never,
      registry: {
        listSkills,
        listAvailableRevisions,
        runtimeStatus: vi.fn().mockResolvedValue({
          active: { revisionIds: [REVISION_ID] },
          activationVersion: 7,
        }),
      } as never,
    });

    const response = await handler(
      new Request("https://admin.example.test/enable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: REQUEST_ID }),
      }),
      { params: Promise.resolve({ skillId: SKILL_ID }) },
    );

    expect(response.status).toBe(200);
    expect(listSkills).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 100, offset: 100 }),
    );
    expect(listAvailableRevisions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 100, offset: 100 }),
    );
    expect(applySkillSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextRevisionIds: [CURRENT_REVISION_ID] }),
    );
  });
});
