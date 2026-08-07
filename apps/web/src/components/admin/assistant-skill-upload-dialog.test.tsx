import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
