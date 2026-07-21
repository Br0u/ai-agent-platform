import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { AssistantSkillUploadDialog } from "./assistant-skill-upload-dialog";

const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSkillUploadDialog", () => {
  it("uploads exactly one ZIP and reports pending_review instead of enabled", async () => {
    const onUploaded = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          version: "1",
          revision: {
            id: REVISION_ID,
            skillId: SKILL_ID,
            name: "safe-review",
            number: 1,
            state: "pending_review",
            sourceType: "upload",
            artifactSha256: "a".repeat(64),
            createdBy: "11111111-1111-4111-8111-111111111111",
            createdAt: "2026-07-21T08:00:00.000Z",
            reviewedBy: null,
            reviewedAt: null,
          },
          requestId: "66666666-6666-4666-8666-666666666666",
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={onUploaded} />,
    );
    const file = new File(["zip"], "safe-review.zip", {
      type: "application/zip",
    });
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/assistant/skills/uploads",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("pending_review");
    expect(document.body.textContent).not.toContain("已启用");
  });

  it("keeps the exact UI POST target aligned with the upload route export", () => {
    const route = readFileSync(
      "src/app/api/v1/admin/assistant/skills/uploads/route.ts",
      "utf8",
    );

    expect(route.trim()).toBe(
      'export { adminSkillUploadHandler as POST } from "../handler";',
    );
  });

  it("rejects a non-ZIP selection without making a request", () => {
    const fetchMock = vi.fn();
    const onClose = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillUploadDialog onClose={onClose} onUploaded={vi.fn()} />,
    );

    expect(screen.getByLabelText("Skill ZIP 文件")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: { files: [new File(["x"], "skill.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/ZIP/u);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
