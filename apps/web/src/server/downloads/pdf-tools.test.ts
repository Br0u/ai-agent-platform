import { EventEmitter } from "node:events";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDownloadFileStore } from "./file-store";
import { createPdfTools, getPdfToolErrorCode, PdfToolError } from "./pdf-tools";

type Outcome = Readonly<{
  stdout?: string;
  stderr?: string;
  code?: number;
  timeout?: boolean;
  pngBytes?: number;
  manualKillClose?: boolean;
  onClose?: () => void;
  error?: Error;
}>;

const roots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "pdf-tools-test-"));
  roots.push(root);
  return root;
}

async function pdfAt(root: string, contents = "%PDF-1.4\n") {
  const pdf = path.join(root, "input.pdf");
  await writeFile(pdf, contents);
  return pdf;
}

function fakeSpawn(outcomes: Outcome[]) {
  return vi.fn((command: string, args: readonly string[]) => {
    const outcome = outcomes.shift();
    if (!outcome) throw new Error(`Unexpected command: ${command}`);
    const child = new EventEmitter() as ChildProcessWithoutNullStreams;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = vi.fn(() => {
      if (!outcome.manualKillClose) {
        queueMicrotask(() => child.emit("close", null, "SIGKILL"));
      }
      return true;
    });
    queueMicrotask(async () => {
      if (outcome.pngBytes !== undefined) {
        const prefix = args.at(-1)!;
        await writeFile(`${prefix}.png`, "png");
        await truncate(`${prefix}.png`, outcome.pngBytes);
      }
      if (outcome.timeout) return;
      if (outcome.error) child.emit("error", outcome.error);
      if (outcome.stdout) stdout.end(outcome.stdout);
      else stdout.end();
      if (outcome.stderr) stderr.end(outcome.stderr);
      else stderr.end();
      child.emit("close", outcome.code ?? 0, null);
      outcome.onClose?.();
    });
    return child;
  });
}

function sharpStub(options: { fail?: boolean } = {}) {
  const toBuffer = vi.fn(async () => {
    if (options.fail) throw new Error("sharp failed");
    return Buffer.from("webp");
  });
  const webp = vi.fn(() => ({ toBuffer }));
  const resize = vi.fn(() => ({ webp }));
  const factory = vi.fn(() => ({ resize }));
  return { factory, resize, webp, toBuffer };
}

function tools(
  spawnProcess: ReturnType<typeof fakeSpawn>,
  sharp = sharpStub(),
  timeoutOnCall?: number,
) {
  let timerCalls = 0;
  return {
    pdfTools: createPdfTools({
      spawnProcess,
      sharpFactory: sharp.factory,
      setTimer: ((callback: () => void, delay: number) => {
        expect(delay).toBe(15_000);
        timerCalls += 1;
        if (timerCalls === timeoutOnCall) queueMicrotask(callback);
        return 1 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout,
      clearTimer: vi.fn() as unknown as typeof clearTimeout,
    }),
    sharp,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("create-download-test-pdf", () => {
  it("creates one deterministic ASCII page exclusively at an explicit new path", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "download-test.pdf");
    const script = path.resolve("scripts/create-download-test-pdf.mjs");

    const first = spawnSync(process.execPath, [script, output]);
    expect(first.status).toBe(0);
    const pdf = await readFile(output);
    const ascii = pdf.toString("ascii");
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(ascii).toContain("Download test");
    expect(ascii).toContain("/Count 1");
    expect(pdf.every((byte) => byte <= 0x7f)).toBe(true);
    const stream = /\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/u.exec(
      ascii,
    )!;
    expect(Buffer.byteLength(stream[2]!, "ascii")).toBe(Number(stream[1]));

    const second = path.join(root, "download-test-2.pdf");
    expect(spawnSync(process.execPath, [script, second]).status).toBe(0);
    expect(await readFile(second)).toEqual(pdf);

    const duplicate = spawnSync(process.execPath, [script, output]);
    expect(duplicate.status).not.toBe(0);
    expect(spawnSync(process.execPath, [script]).status).not.toBe(0);
    expect(
      spawnSync(process.execPath, [script, "implicit.pdf"]).status,
    ).not.toBe(0);
  });
});

describe("PDF metadata and cover derivation", () => {
  it("validates the PDF prefix before spawning any tool", async () => {
    const root = await temporaryRoot();
    const spawnProcess = fakeSpawn([]);
    const { pdfTools } = tools(spawnProcess);

    await expect(
      pdfTools.derive(
        await pdfAt(root, "not a pdf"),
        createDownloadFileStore(root),
      ),
    ).rejects.toThrow("Invalid PDF");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it.each([
    ["pdfinfo failure", { code: 1, stderr: "Syntax Error" }],
    ["corrupt PDF warning", { stdout: "Pages: 1\n", stderr: "Syntax Error" }],
    ["encrypted PDF", { stdout: "Pages: 1\nEncrypted: yes\n" }],
    ["zero pages", { stdout: "Pages: 0\n" }],
    ["too many pages", { stdout: "Pages: 5001\n" }],
    ["ambiguous pages", { stdout: "Pages: 1\nPages: 2\n" }],
    [
      "oversized combined output",
      { stdout: "a".repeat(40_000), stderr: "b".repeat(30_000) },
    ],
  ])("fails closed for %s", async (_name, outcome) => {
    const root = await temporaryRoot();
    const { pdfTools } = tools(fakeSpawn([outcome]));
    await expect(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    ).rejects.toThrow();
  });

  it("kills and waits for a timed-out pdfinfo process", async () => {
    const root = await temporaryRoot();
    const spawnProcess = fakeSpawn([{ timeout: true }]);
    const { pdfTools } = tools(spawnProcess, sharpStub(), 1);
    await expect(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    ).rejects.toThrow("PDF processing failed");
    expect(spawnProcess.mock.results[0]!.value.kill).toHaveBeenCalledWith(
      "SIGKILL",
    );
  });

  it("fails fast for an already-aborted request without spawning a tool", async () => {
    const root = await temporaryRoot();
    const controller = new AbortController();
    controller.abort();
    const spawnProcess = fakeSpawn([]);
    const { pdfTools } = tools(spawnProcess);

    await expect(
      pdfTools.derive(
        await pdfAt(root),
        createDownloadFileStore(root),
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("kills pdfinfo on abort, waits for close, and removes its listener", async () => {
    const root = await temporaryRoot();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const spawnProcess = fakeSpawn([{ timeout: true, manualKillClose: true }]);
    const { pdfTools } = tools(spawnProcess);
    let settled = false;
    const derivation = pdfTools
      .derive(
        await pdfAt(root),
        createDownloadFileStore(root),
        controller.signal,
      )
      .finally(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(1));

    controller.abort();
    await Promise.resolve();
    const child = spawnProcess.mock.results[0]!.value;
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(settled).toBe(false);

    child.emit("close", null, "SIGKILL");
    await expect(derivation).rejects.toThrow("aborted");
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not spawn pdftoppm when aborted between tool processes", async () => {
    const root = await temporaryRoot();
    const controller = new AbortController();
    const spawnProcess = fakeSpawn([
      {
        stdout: "Pages: 1\n",
        onClose: () => controller.abort(),
      },
      { pngBytes: 1024 },
    ]);
    const { pdfTools } = tools(spawnProcess);

    await expect(
      pdfTools.derive(
        await pdfAt(root),
        createDownloadFileStore(root),
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it("kills pdftoppm on abort, waits for close, and removes its PNG", async () => {
    const root = await temporaryRoot();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const spawnProcess = fakeSpawn([
      { stdout: "Pages: 1\n" },
      { timeout: true, pngBytes: 1024, manualKillClose: true },
    ]);
    const { pdfTools } = tools(spawnProcess);
    let settled = false;
    const derivation = pdfTools
      .derive(
        await pdfAt(root),
        createDownloadFileStore(root),
        controller.signal,
      )
      .finally(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(2));
    const child = spawnProcess.mock.results[1]!.value;
    const prefix = spawnProcess.mock.calls[1]![1].at(-1)!;

    controller.abort();
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    child.emit("close", null, "SIGKILL");

    await expect(derivation).rejects.toThrow("aborted");
    await expect(readFile(`${prefix}.png`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readdir(path.join(root, "staging"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["timeout", { timeout: true }, true],
    ["oversized output", { stdout: "x".repeat(65_537) }, false],
  ])(
    "bounds pdftoppm %s and cleans its PNG",
    async (_name, render, timeout) => {
      const root = await temporaryRoot();
      const spawnProcess = fakeSpawn([{ stdout: "Pages: 1\n" }, render]);
      const { pdfTools } = tools(
        spawnProcess,
        sharpStub(),
        timeout ? 2 : undefined,
      );
      await expect(
        pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
      ).rejects.toThrow();
      const prefix = spawnProcess.mock.calls[1]![1].at(-1)!;
      await expect(readFile(`${prefix}.png`)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("renders only page one with bounded dimensions and creates a metadata-stripped WebP stage", async () => {
    const root = await temporaryRoot();
    const spawnProcess = fakeSpawn([
      { stdout: "Title: test\nPages: 3\nEncrypted: no\n" },
      { pngBytes: 1024 },
    ]);
    const sharp = sharpStub();
    const { pdfTools } = tools(spawnProcess, sharp);
    const store = createDownloadFileStore(root);

    const result = await pdfTools.derive(await pdfAt(root), store);

    expect(result.pageCount).toBe(3);
    expect(spawnProcess.mock.calls).toEqual([
      [
        "pdfinfo",
        [path.join(root, "input.pdf")],
        { shell: false, stdio: ["ignore", "pipe", "pipe"] },
      ],
      [
        "pdftoppm",
        [
          "-f",
          "1",
          "-singlefile",
          "-png",
          "-r",
          "96",
          "-scale-to-x",
          "1280",
          "-scale-to-y",
          "-1",
          path.join(root, "input.pdf"),
          expect.any(String),
        ],
        { shell: false, stdio: ["ignore", "pipe", "pipe"] },
      ],
    ]);
    expect(sharp.factory).toHaveBeenCalledWith(expect.any(String), {
      limitInputPixels: 40_000_000,
    });
    expect(sharp.resize).toHaveBeenCalledWith({
      width: 640,
      withoutEnlargement: true,
    });
    expect(sharp.webp).toHaveBeenCalledWith({ quality: 72 });
    expect(sharp.factory.mock.results[0]!.value).not.toHaveProperty(
      "withMetadata",
    );
    expect(await readFile(result.stagedCover.path, "utf8")).toBe("webp");
    await result.stagedCover.writable.close();
  });

  it("rejects a PNG over 50 MiB before Sharp and removes it", async () => {
    const root = await temporaryRoot();
    const spawnProcess = fakeSpawn([
      { stdout: "Pages: 1\n" },
      { pngBytes: 50 * 1024 * 1024 + 1 },
    ]);
    const sharp = sharpStub();
    const { pdfTools } = tools(spawnProcess, sharp);
    await expect(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    ).rejects.toThrow("Invalid PDF");
    expect(sharp.factory).not.toHaveBeenCalled();
    const prefix = spawnProcess.mock.calls[1]![1].at(-1)!;
    await expect(readFile(`${prefix}.png`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("removes the WebP stage and intermediate PNG when Sharp fails", async () => {
    const root = await temporaryRoot();
    const spawnProcess = fakeSpawn([
      { stdout: "Pages: 1\n" },
      { pngBytes: 1024 },
    ]);
    const { pdfTools } = tools(spawnProcess, sharpStub({ fail: true }));
    await expect(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    ).rejects.toThrow("PDF processing failed");
    expect(await readdir(path.join(root, "staging"))).toEqual([]);
    const prefix = spawnProcess.mock.calls[1]![1].at(-1)!;
    await expect(readFile(`${prefix}.png`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("PDF tool error classification", () => {
  async function rejected(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error("Expected rejection");
  }

  it.each([
    ["invalid prefix", [], "not a pdf"],
    ["encrypted PDF", [{ stdout: "Pages: 1\nEncrypted: yes\n" }], "%PDF-1.4\n"],
    [
      "pdfinfo parse failure",
      [{ code: 1, stderr: "Syntax Error at /private/customer.pdf" }],
      "%PDF-1.4\n",
    ],
    [
      "pdftoppm parse failure",
      [{ stdout: "Pages: 1\n" }, { code: 1, stderr: "bad object" }],
      "%PDF-1.4\n",
    ],
  ])(
    "classifies %s as invalid_pdf with a safe public message",
    async (_name, outcomes, contents) => {
      const root = await temporaryRoot();
      const { pdfTools } = tools(fakeSpawn(outcomes));
      const input = await pdfAt(root, contents);
      const error = await rejected(
        pdfTools.derive(input, createDownloadFileStore(root)),
      );

      expect(error).toBeInstanceOf(PdfToolError);
      expect(getPdfToolErrorCode(error)).toBe("invalid_pdf");
      expect((error as Error).message).toBe("Invalid PDF");
      expect((error as Error).message).not.toContain(input);
      expect((error as Error).message).not.toContain("Syntax Error");
    },
  );

  it("classifies spawn ENOENT as processing_failed without leaking the executable error", async () => {
    const root = await temporaryRoot();
    const spawnFailure = Object.assign(
      new Error("spawn pdfinfo ENOENT at /private/bin/pdfinfo"),
      { code: "ENOENT" },
    );
    const { pdfTools } = tools(fakeSpawn([{ error: spawnFailure }]));
    const error = await rejected(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    );

    expect(error).toBeInstanceOf(PdfToolError);
    expect(getPdfToolErrorCode(error)).toBe("processing_failed");
    expect((error as Error).message).toBe("PDF processing failed");
    expect((error as Error).message).not.toContain("/private/bin");
  });

  it("classifies a tool timeout as processing_failed", async () => {
    const root = await temporaryRoot();
    const { pdfTools } = tools(fakeSpawn([{ timeout: true }]), sharpStub(), 1);
    const error = await rejected(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    );

    expect(error).toBeInstanceOf(PdfToolError);
    expect(getPdfToolErrorCode(error)).toBe("processing_failed");
  });

  it("classifies Sharp failure as processing_failed", async () => {
    const root = await temporaryRoot();
    const { pdfTools } = tools(
      fakeSpawn([{ stdout: "Pages: 1\n" }, { pngBytes: 1024 }]),
      sharpStub({ fail: true }),
    );
    const error = await rejected(
      pdfTools.derive(await pdfAt(root), createDownloadFileStore(root)),
    );

    expect(error).toBeInstanceOf(PdfToolError);
    expect(getPdfToolErrorCode(error)).toBe("processing_failed");
  });

  it("preserves AbortError instead of turning cancellation into a PDF tool error", async () => {
    const root = await temporaryRoot();
    const controller = new AbortController();
    controller.abort();
    const { pdfTools } = tools(fakeSpawn([]));
    const error = await rejected(
      pdfTools.derive(
        await pdfAt(root),
        createDownloadFileStore(root),
        controller.signal,
      ),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(error).not.toBeInstanceOf(PdfToolError);
    expect(getPdfToolErrorCode(error)).toBeUndefined();
    expect(getPdfToolErrorCode(new Error("invalid_pdf"))).toBeUndefined();
  });

  it("retains the primary classification when cleanup also fails", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const originalCreateStage = store.createStage.bind(store);
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const close = stage.writable.close.bind(stage.writable);
      stage.writable.close = vi.fn(async () => {
        await close();
        throw new Error("cleanup failed at /private/staging/cover.webp");
      });
      return stage;
    });
    const { pdfTools } = tools(
      fakeSpawn([{ stdout: "Pages: 1\n" }, { pngBytes: 1024 }]),
      sharpStub({ fail: true }),
    );
    const error = await rejected(pdfTools.derive(await pdfAt(root), store));

    expect(error).toBeInstanceOf(AggregateError);
    expect(getPdfToolErrorCode(error)).toBe("processing_failed");
    expect((error as Error).message).not.toContain("/private/staging");
  });
});
