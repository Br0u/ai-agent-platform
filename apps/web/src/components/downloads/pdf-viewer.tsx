"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./pdf-viewer.css";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;

type ViewerFailure = { message: string };
type PdfViewerProps = {
  backHref: string;
  sourceUrl: string;
  title: string;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const MAX_CANVAS_PIXELS = 16_777_216;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function failureMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const status = "status" in error ? error.status : undefined;
    if (status === 401) return "登录状态已失效，请重新登录";
    if (status === 403) return "没有权限查看这份资料";
    if (status === 404) return "这份资料不存在或已下线";
    const name = "name" in error ? error.name : undefined;
    if (name === "PasswordException")
      return "这份 PDF 受密码保护，暂时无法预览";
    if (name === "InvalidPDFException") return "PDF 文件格式无效，暂时无法预览";
  }
  return "资料加载失败，请重试";
}

export function PdfViewer(props: PdfViewerProps) {
  return <PdfViewerDocument key={props.sourceUrl} {...props} />;
}

function PdfViewerDocument({ backHref, sourceUrl, title }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(true);
  const [manualZoom, setManualZoom] = useState(1);
  const [pageNumber, setPageNumber] = useState(1);
  const [renderScale, setRenderScale] = useState(1);
  const [retry, setRetry] = useState(0);
  const loadKey = `${sourceUrl}\0${retry}`;
  const [loaded, setLoaded] = useState<{
    document: PdfDocument;
    key: string;
  } | null>(null);
  const [failed, setFailed] = useState<
    (ViewerFailure & { key: string }) | null
  >(null);
  const [loadStage, setLoadStage] = useState<{
    key: string;
    value: "rendering" | "ready";
  } | null>(null);
  const [textContent, setTextContent] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const document = loaded?.key === loadKey ? loaded.document : null;
  const failure = failed?.key === loadKey ? failed : null;
  const stage = loadStage?.key === loadKey ? loadStage.value : "loading";
  const pageKey = `${loadKey}\0${pageNumber}`;
  const pageText = textContent?.key === pageKey ? textContent.value : null;

  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportWidth(entry.contentRect.width);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PdfLoadingTask | undefined;
    let loadedDocument: PdfDocument | undefined;
    let destroyPromise: Promise<void> | undefined;

    const destroy = () => {
      if (destroyPromise) return destroyPromise;
      if (!loadingTask) return Promise.resolve();
      try {
        destroyPromise = loadingTask.destroy().catch(() => undefined);
      } catch {
        destroyPromise = Promise.resolve();
      }
      return destroyPromise;
    };

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        loadingTask = pdfjs.getDocument({ url: sourceUrl });
        loadedDocument = await loadingTask.promise;
        if (disposed) {
          await destroy();
          return;
        }
        setLoaded({ document: loadedDocument, key: loadKey });
        setLoadStage({ key: loadKey, value: "rendering" });
      } catch (error: unknown) {
        await destroy();
        if (!disposed)
          setFailed({ key: loadKey, message: failureMessage(error) });
      }
    })();

    return () => {
      disposed = true;
      void destroy();
    };
  }, [loadKey, sourceUrl]);

  useEffect(() => {
    if (!document) return;
    let disposed = false;
    let renderTask: { cancel(): void; promise: Promise<void> } | undefined;

    void (async () => {
      const page = await document.getPage(pageNumber);
      if (disposed) return;
      const naturalViewport = page.getViewport({ scale: 1 });
      const scale = fitWidth
        ? clampZoom(
            viewportWidth > 0 ? viewportWidth / naturalViewport.width : 1,
          )
        : manualZoom;
      const viewport = page.getViewport({ scale });
      const textPromise = page.getTextContent();
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) throw new Error("canvas unavailable");

      const desiredOutputScale = Math.max(window.devicePixelRatio || 1, 1);
      const outputScale = Math.min(
        desiredOutputScale,
        Math.sqrt(
          MAX_CANVAS_PIXELS / Math.max(viewport.width * viewport.height, 1),
        ),
      );
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      setRenderScale(scale);
      renderTask = page.render({
        canvas,
        canvasContext: context,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
        viewport,
      });
      const [, pageTextContent] = await Promise.all([
        renderTask.promise,
        textPromise,
      ]);
      if (!disposed) {
        const value = pageTextContent.items
          .flatMap((item) => ("str" in item ? [item.str] : []))
          .join(" ")
          .trim();
        setTextContent({
          key: pageKey,
          value: value || "本页没有可提取文本",
        });
        setLoadStage({ key: loadKey, value: "ready" });
      }
    })().catch((error: unknown) => {
      if (
        !disposed &&
        !(
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "RenderingCancelledException"
        )
      ) {
        setFailed({
          key: loadKey,
          message: "页面渲染失败，请重试",
        });
      }
    });

    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [
    document,
    fitWidth,
    loadKey,
    manualZoom,
    pageKey,
    pageNumber,
    viewportWidth,
  ]);

  const totalPages = document?.numPages ?? 0;
  const zoom = Math.round((fitWidth ? renderScale : manualZoom) * 100);
  const changeZoom = (delta: number) => {
    setLoadStage({ key: loadKey, value: "rendering" });
    setManualZoom((current) =>
      clampZoom((fitWidth ? renderScale : current) + delta),
    );
    setFitWidth(false);
  };

  return (
    <main className="pdf-reader">
      <header className="pdf-reader__header">
        <Link className="pdf-reader__back" href={backHref}>
          返回
        </Link>
        <h1>{title}</h1>
        <nav aria-label="PDF 阅读控制" className="pdf-reader__toolbar">
          <button
            disabled={pageNumber <= 1 || !document}
            onClick={() => {
              setLoadStage({ key: loadKey, value: "rendering" });
              setPageNumber((current) => current - 1);
            }}
            type="button"
          >
            上一页
          </button>
          <output aria-live="polite">
            第 {pageNumber} / {totalPages || "—"} 页
          </output>
          <button
            disabled={!document || pageNumber >= totalPages}
            onClick={() => {
              setLoadStage({ key: loadKey, value: "rendering" });
              setPageNumber((current) => current + 1);
            }}
            type="button"
          >
            下一页
          </button>
          <span aria-label="缩放控制" className="pdf-reader__zoom">
            <button
              aria-label="缩小"
              disabled={!document || (!fitWidth && manualZoom <= MIN_ZOOM)}
              onClick={() => changeZoom(-ZOOM_STEP)}
              type="button"
            >
              −
            </button>
            <output aria-label="当前缩放比例">{zoom}%</output>
            <button
              aria-label="放大"
              disabled={!document || (!fitWidth && manualZoom >= MAX_ZOOM)}
              onClick={() => changeZoom(ZOOM_STEP)}
              type="button"
            >
              +
            </button>
          </span>
          <button
            aria-pressed={fitWidth}
            disabled={!document}
            onClick={() => {
              setLoadStage({ key: loadKey, value: "rendering" });
              setFitWidth(true);
            }}
            type="button"
          >
            适合宽度
          </button>
        </nav>
      </header>

      <section
        aria-busy={stage !== "ready" && !failure}
        aria-label="PDF 页面"
        className="pdf-reader__viewport"
        ref={viewportRef}
      >
        {stage !== "ready" && !failure ? (
          <p className="pdf-reader__status" role="status">
            {stage === "loading" ? "正在加载资料…" : "正在渲染页面…"}
          </p>
        ) : null}
        {failure ? (
          <div className="pdf-reader__error" role="alert">
            <p>{failure.message}</p>
            <button
              onClick={() => setRetry((current) => current + 1)}
              type="button"
            >
              重试
            </button>
          </div>
        ) : null}
        <canvas
          aria-hidden="true"
          className={
            failure || stage !== "ready"
              ? "pdf-reader__canvas is-hidden"
              : "pdf-reader__canvas"
          }
          ref={canvasRef}
        />
        {pageText ? (
          <div
            aria-label={`第 ${pageNumber} 页正文`}
            className="pdf-reader__text"
            role="document"
          >
            {pageText}
          </div>
        ) : null}
      </section>
    </main>
  );
}
