import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { StrictMode } from "react";

import { AssistantSkillUploadDialog } from "./assistant-skill-upload-dialog";

const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function uploadEnvelope() {
  return {
    version: "1" as const,
    revision: {
      id: REVISION_ID,
      skillId: SKILL_ID,
      name: "safe-review",
      number: 1,
      state: "pending_review" as const,
      sourceType: "upload" as const,
      artifactSha256: "a".repeat(64),
      createdBy: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-07-21T08:00:00.000Z",
      reviewedBy: null,
      reviewedAt: null,
    },
    requestId: "strict-upload",
  };
}

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

  it("explains when the uploaded ZIP fails server-side validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            version: "1",
            requestId: "invalid-archive",
            error: {
              code: "validation_error",
              message: "Invalid skill request",
              retryable: false,
            },
          },
          { status: 400 },
        ),
      ),
    );
    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "invalid-skill.zip", {
            type: "application/zip",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Skill ZIP 格式不符合要求，请检查压缩包目录结构后重试。",
    );
  });

  it("explains when the Skill Registry is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            version: "1",
            requestId: "registry-offline",
            error: {
              code: "registry_unavailable",
              message: "Skill Registry is unavailable",
              retryable: true,
            },
          },
          { status: 503 },
        ),
      ),
    );
    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review.zip", {
            type: "application/zip",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Skill Registry 当前不可用，请联系管理员启动服务后重试。",
    );
  });

  it("does not describe a rejected upload origin as an invalid ZIP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            version: "1",
            requestId: "origin-rejected",
            error: {
              code: "permission_denied",
              message: "Permission denied",
              retryable: false,
            },
          },
          { status: 403 },
        ),
      ),
    );
    render(
      <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review.zip", {
            type: "application/zip",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "上传请求被拒绝；请确认访问地址已配置并重新登录后重试。",
    );
  });

  it("traps focus and blocks background interaction across body levels", () => {
    const backgroundClick = vi.fn();
    const externalClick = vi.fn();
    const external = document.createElement("button");
    external.textContent = "外层背景操作";
    external.setAttribute("inert", "legacy");
    external.setAttribute("aria-hidden", "false");
    external.addEventListener("click", externalClick);
    document.body.append(external);
    const view = render(
      <>
        <div>
          <button onClick={backgroundClick} type="button">
            内层背景操作
          </button>
        </div>
        <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={vi.fn()} />
      </>,
    );

    const dialog = screen.getByRole("dialog");
    const first = screen.getByRole("button", { name: "关闭" });
    const last = screen.getByRole("button", { name: "提交审核" });
    expect(screen.getByLabelText("Skill ZIP 文件")).toHaveFocus();
    expect(view.container).toHaveAttribute("inert");
    expect(view.container).toHaveAttribute("aria-hidden", "true");
    expect(external).toHaveAttribute("inert");

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    const nestedBackground = screen.getByRole("button", {
      name: "内层背景操作",
      hidden: true,
    });
    nestedBackground.focus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    external.focus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.click(nestedBackground);
    fireEvent.click(external);
    expect(backgroundClick).not.toHaveBeenCalled();
    expect(externalClick).not.toHaveBeenCalled();

    view.unmount();
    expect(view.container).not.toHaveAttribute("inert");
    expect(view.container).not.toHaveAttribute("aria-hidden");
    expect(external).toHaveAttribute("inert", "legacy");
    expect(external).toHaveAttribute("aria-hidden", "false");
    external.remove();
  });

  it("blocks synchronous duplicate submits and all close paths while uploading", async () => {
    const upload = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(upload.promise)
      .mockResolvedValue(new Response(null, { status: 503 }));
    const onClose = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AssistantSkillUploadDialog onClose={onClose} onUploaded={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review.zip", { type: "application/zip" }),
        ],
      },
    });
    const form = screen
      .getByRole("button", { name: "提交审核" })
      .closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    upload.resolve(new Response(null, { status: 503 }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/上传失败/u);
    expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "提交审核" })).toBeEnabled();
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("accepts the current upload response after the StrictMode effect probe", async () => {
    const onUploaded = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json(uploadEnvelope(), { status: 201 })),
    );
    render(
      <StrictMode>
        <AssistantSkillUploadDialog onClose={vi.fn()} onUploaded={onUploaded} />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText("Skill ZIP 文件"), {
      target: {
        files: [
          new File(["zip"], "safe-review.zip", { type: "application/zip" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
  });
});
