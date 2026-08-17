import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

function deferred<T>() {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function documentFixture(
  options: {
    height?: number;
    pageCount?: number;
    renderRejects?: boolean;
    width?: number;
  } = {},
) {
  const tasks: RenderTask[] = [];
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: vi.fn(async () => ({
      items: [{ str: `第 ${pageNumber} 页可访问正文` }],
    })),
    getViewport: ({ scale }: { scale: number }) => ({
      height: (options.height ?? 1_000) * scale,
      width: (options.width ?? 800) * scale,
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
  const document = { getPage, numPages: options.pageCount ?? 3 };
  const loadingTask = {
    destroy: vi.fn(async () => undefined),
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
    expect(await screen.findByLabelText("第 1 页正文")).toHaveTextContent(
      "第 1 页可访问正文",
    );
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第 2 / 3 页")).toBeVisible();
    expect(fixture.getPage).toHaveBeenLastCalledWith(2);
    expect(fixture.getPage).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText("第 2 页正文")).toHaveTextContent(
      "第 2 页可访问正文",
    );
    expect(screen.queryByText("第 1 页可访问正文")).not.toBeInTheDocument();
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
      getTextContent: vi.fn(async () => ({ items: [{ str: "正文" }] })),
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

  it("does not create a loading task after unmounting before import resolves", async () => {
    const fixture = documentFixture();
    pdf.getDocument.mockReturnValue(fixture.loadingTask);

    const rendered = renderViewer();
    rendered.unmount();
    await act(async () => Promise.resolve());

    expect(pdf.getDocument).not.toHaveBeenCalled();
  });

  it("destroys a rejected loading task immediately and handles destroy rejection", async () => {
    const destroyRejection = Promise.reject(new Error("destroy failed"));
    const catchSpy = vi.spyOn(destroyRejection, "catch");
    destroyRejection.catch(() => undefined);
    catchSpy.mockClear();
    const loadingTask = {
      destroy: vi.fn(() => destroyRejection),
      promise: Promise.reject({ status: 404 }),
    };
    pdf.getDocument.mockReturnValue(loadingTask);

    renderViewer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "这份资料不存在或已下线",
    );
    expect(loadingTask.destroy).toHaveBeenCalledOnce();
    expect(catchSpy).toHaveBeenCalledOnce();
  });

  it("resets page, zoom and canvas when the PDF source changes", async () => {
    const first = documentFixture();
    const second = documentFixture({ pageCount: 1 });
    const secondLoad = deferred<typeof second.document>();
    second.loadingTask.promise = secondLoad.promise;
    pdf.getDocument
      .mockReturnValueOnce(first.loadingTask)
      .mockReturnValueOnce(second.loadingTask);

    const rendered = renderViewer();
    await screen.findByLabelText("第 1 页正文");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByLabelText("第 2 页正文");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByLabelText("第 3 页正文");
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByText("125%")).toBeVisible();

    rendered.rerender(
      <PdfViewer
        backHref="/downloads"
        sourceUrl="/api/v1/downloads/new-guide/preview"
        title="新彩页"
      />,
    );

    expect(screen.getByText("第 1 / — 页")).toBeVisible();
    expect(screen.getByText("100%")).toBeVisible();
    expect(rendered.container.querySelector("canvas")).toHaveClass("is-hidden");
    await waitFor(() => expect(pdf.getDocument).toHaveBeenCalledTimes(2));
    secondLoad.resolve(second.document);
    expect(await screen.findByText("第 1 / 1 页")).toBeVisible();
    expect(second.getPage).toHaveBeenCalledWith(1);
    expect(second.getPage).not.toHaveBeenCalledWith(3);
    expect(first.loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it("limits the backing canvas pixel area at high device pixel ratios", async () => {
    vi.stubGlobal("devicePixelRatio", 8);
    const fixture = documentFixture({ height: 5_000, width: 4_000 });
    pdf.getDocument.mockReturnValue(fixture.loadingTask);
    renderViewer();

    await screen.findByLabelText("第 1 页正文");
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_777_216);
  });

  it("cancels both the obsolete and current in-flight render tasks", async () => {
    const firstRender = deferred<void>();
    const secondRender = deferred<void>();
    const tasks = [firstRender, secondRender].map((pending) => ({
      cancel: vi.fn(),
      promise: pending.promise,
    }));
    let renderIndex = 0;
    const getPage = vi.fn(async (pageNumber: number) => ({
      getTextContent: vi.fn(async () => ({
        items: [{ str: `正文 ${pageNumber}` }],
      })),
      getViewport: ({ scale }: { scale: number }) => ({
        height: 1_000 * scale,
        width: 800 * scale,
      }),
      render: vi.fn(() => tasks[renderIndex++]!),
    }));
    const loadingTask = {
      destroy: vi.fn(async () => undefined),
      promise: Promise.resolve({ getPage, numPages: 2 }),
    };
    pdf.getDocument.mockReturnValue(loadingTask);

    const rendered = renderViewer();
    await waitFor(() => expect(renderIndex).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(renderIndex).toBe(2));
    expect(tasks[0]!.cancel).toHaveBeenCalledOnce();

    rendered.unmount();
    expect(tasks[1]!.cancel).toHaveBeenCalledOnce();
    firstRender.resolve();
    secondRender.resolve();
  });

  it.each([
    [{ status: 401 }, "登录状态已失效，请重新登录"],
    [{ status: 403 }, "没有权限查看这份资料"],
    [{ status: 404 }, "这份资料不存在或已下线"],
    [{ name: "PasswordException" }, "这份 PDF 受密码保护，暂时无法预览"],
    [{ name: "InvalidPDFException" }, "PDF 文件格式无效，暂时无法预览"],
  ])("shows a readable loading failure for %o", async (failure, message) => {
    pdf.getDocument.mockReturnValue({
      destroy: vi.fn(async () => undefined),
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
