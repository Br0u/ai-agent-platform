import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pdf = vi.hoisted(() => ({
  workerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: pdf.workerOptions,
  getDocument: pdf.getDocument,
}));
import { PdfViewer } from "./pdf-viewer";

type RenderTask = { cancel: ReturnType<typeof vi.fn>; promise: Promise<void> };

let resize: ((entries: ResizeObserverEntry[]) => void) | undefined;
let width = 800;

function documentFixture(options: { renderRejects?: boolean } = {}) {
  const tasks: RenderTask[] = [];
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      height: 1_000 * scale,
      width: 800 * scale,
    }),
    render: vi.fn(() => {
      const task = {
        cancel: vi.fn(),
        promise: options.renderRejects
          ? Promise.reject(new Error("render failed"))
          : Promise.resolve(),
      };
      tasks.push(task);
      return task;
    }),
  }));
  const document = { destroy: vi.fn(), getPage, numPages: 3 };
  const loadingTask = {
    destroy: vi.fn(),
    promise: Promise.resolve(document),
  };
  return { document, getPage, loadingTask, tasks };
}

function renderViewer() {
  return render(
    <PdfViewer
      backHref="/downloads"
      sourceUrl="/api/v1/downloads/guide/preview"
      title="产品彩页"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  pdf.workerOptions.workerSrc = "";
  width = 800;
  resize = undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: ResizeObserverEntry[]) => void) {
        resize = callback;
      }
      disconnect = vi.fn();
      observe = vi.fn((target: Element) => {
        resize?.([
          { contentRect: { width }, target } as unknown as ResizeObserverEntry,
        ]);
      });
      unobserve = vi.fn();
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PdfViewer", () => {
  it("loads the bundled worker and renders only the selected page", async () => {
    const fixture = documentFixture();
    pdf.getDocument.mockReturnValue(fixture.loadingTask);

    renderViewer();
    expect(screen.getByText("正在加载资料…")).toBeVisible();

    expect(await screen.findByText("第 1 / 3 页")).toBeVisible();
    expect(pdf.workerOptions.workerSrc).toContain("pdf.worker.min.mjs");
    expect(fixture.getPage).toHaveBeenCalledTimes(1);
    expect(fixture.getPage).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第 2 / 3 页")).toBeVisible();
    expect(fixture.getPage).toHaveBeenLastCalledWith(2);
    expect(fixture.getPage).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "返回" })).toHaveAttribute(
      "href",
      "/downloads",
    );
    expect(screen.queryByText(/下载|打印|编辑|批注/u)).not.toBeInTheDocument();
  });

  it("caps manual zoom and keeps fit width responsive", async () => {
    const fixture = documentFixture();
    pdf.getDocument.mockReturnValue(fixture.loadingTask);
    renderViewer();
    await screen.findByText("第 1 / 3 页");

    for (let index = 0; index < 12; index += 1)
      fireEvent.click(screen.getByRole("button", { name: "缩小" }));
    expect(screen.getByText("50%")).toBeVisible();

    for (let index = 0; index < 30; index += 1)
      fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByText("300%")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "适合宽度" }));
    width = 640;
    act(() =>
      resize?.([{ contentRect: { width } } as unknown as ResizeObserverEntry]),
    );
    expect(await screen.findByText("80%")).toBeVisible();
  });

  it("cancels obsolete rendering and destroys PDF work on navigation away", async () => {
    let settleRender: (() => void) | undefined;
    const fixture = documentFixture();
    fixture.document.getPage.mockResolvedValue({
      getViewport: ({ scale }: { scale: number }) => ({
        height: 1_000 * scale,
        width: 800 * scale,
      }),
      render: vi.fn(() => {
        const task = {
          cancel: vi.fn(),
          promise: new Promise<void>((resolve) => {
            settleRender = resolve;
          }),
        };
        fixture.tasks.push(task);
        return task;
      }),
    });
    pdf.getDocument.mockReturnValue(fixture.loadingTask);

    const rendered = renderViewer();
    await screen.findByText("第 1 / 3 页");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(fixture.tasks[0]?.cancel).toHaveBeenCalledOnce();

    rendered.unmount();
    expect(fixture.tasks.at(-1)?.cancel).toHaveBeenCalledOnce();
    expect(fixture.loadingTask.destroy).toHaveBeenCalledOnce();
    settleRender?.();
  });

  it.each([
    [{ status: 401 }, "登录状态已失效，请重新登录"],
    [{ status: 403 }, "没有权限查看这份资料"],
    [{ status: 404 }, "这份资料不存在或已下线"],
    [{ name: "PasswordException" }, "这份 PDF 受密码保护，暂时无法预览"],
    [{ name: "InvalidPDFException" }, "PDF 文件格式无效，暂时无法预览"],
  ])("shows a readable loading failure for %o", async (failure, message) => {
    pdf.getDocument.mockReturnValue({
      destroy: vi.fn(),
      promise: Promise.reject(failure),
    });
    renderViewer();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("reports render failures and retries the document load", async () => {
    const broken = documentFixture({ renderRejects: true });
    const recovered = documentFixture();
    pdf.getDocument
      .mockReturnValueOnce(broken.loadingTask)
      .mockReturnValueOnce(recovered.loadingTask);
    renderViewer();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "页面渲染失败，请重试",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("第 1 / 3 页")).toBeVisible();
    expect(pdf.getDocument).toHaveBeenCalledTimes(2);
  });
});
