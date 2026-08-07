import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantSkillUploadDialog } from "./assistant-skill-upload-dialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSkillUploadDialog", () => {
  it("uploads a ZIP and returns a directly available revision", async () => {
    const onUploaded = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
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
          requestId: "upload-request",
        }),
      ),
    );
    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={onUploaded} />,
    );

    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded.mock.calls[0]?.[0].state).toBe("published");
  });

  it("confirms an active same-name replacement in one follow-up request", async () => {
    const onUploaded = vi.fn();
    const skillId = "33333333-3333-4333-8333-333333333333";
    const revision = {
      id: "44444444-4444-4444-8444-444444444444",
      skillId,
      name: "safe-skill",
      number: 2,
      state: "published",
      sourceType: "upload",
      artifactSha256: "b".repeat(64),
      createdBy: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-07T08:00:00.000Z",
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            version: "1",
            requestId: "conflict",
            error: { code: "state_conflict" },
            conflictingSkillId: skillId,
            replacementToken: "a".repeat(64),
            conflictingSkillEnabled: true,
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ version: "1", revision, requestId: "replacement" }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={onUploaded} />,
    );

    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(revision));
    expect(window.confirm).toHaveBeenCalledWith("发现同名 Skill，是否替换？");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "/api/v1/admin/assistant/skills/uploads",
    );
    const replacementBody = fetcher.mock.calls[1]?.[1]?.body as FormData;
    expect(replacementBody.get("targetSkillId")).toBe(skillId);
    expect(replacementBody.get("expectedArtifactSha256")).toBe("a".repeat(64));
  });

  it("keeps an inactive same-name replacement inactive", async () => {
    const onUploaded = vi.fn();
    const skillId = "33333333-3333-4333-8333-333333333333";
    const revision = {
      id: "44444444-4444-4444-8444-444444444444",
      skillId,
      name: "safe-skill",
      number: 2,
      state: "published",
      sourceType: "upload",
      artifactSha256: "b".repeat(64),
      createdBy: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-08-07T08:00:00.000Z",
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            version: "1",
            requestId: "conflict",
            error: { code: "state_conflict" },
            conflictingSkillId: skillId,
            replacementToken: "a".repeat(64),
            conflictingSkillEnabled: false,
          },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ version: "1", revision, requestId: "replacement" }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={onUploaded} />,
    );

    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["zip"], "safe-skill.zip")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(revision));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
