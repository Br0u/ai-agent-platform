import "server-only";

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

import sharp from "sharp";

import type { DownloadStage } from "./file-store";

const PROCESS_TIMEOUT_MS = 15_000;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
const MAX_PNG_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 5_000;

export type PdfToolErrorCode = "invalid_pdf" | "processing_failed";

export class PdfToolError extends Error {
  constructor(readonly code: PdfToolErrorCode) {
    super(code === "invalid_pdf" ? "Invalid PDF" : "PDF processing failed");
    this.name = "PdfToolError";
  }
}

export function getPdfToolErrorCode(
  error: unknown,
): PdfToolErrorCode | undefined {
  const seen = new Set<unknown>();
  function find(value: unknown): PdfToolErrorCode | undefined {
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (value instanceof PdfToolError) return value.code;
    if (value instanceof AggregateError && Array.isArray(value.errors)) {
      for (const nested of value.errors) {
        const code = find(nested);
        if (code) return code;
      }
    }
    return undefined;
  }
  return find(error);
}

type ProcessFailureKind = "exit" | "output" | "signal" | "spawn" | "timeout";

class ProcessFailure extends Error {
  constructor(
    readonly kind: ProcessFailureKind,
    readonly exitCode?: number | null,
  ) {
    super("PDF tool process failed");
    this.name = "ProcessFailure";
  }
}

function invalidPdf() {
  return new PdfToolError("invalid_pdf");
}

function classify(error: unknown): Error {
  if (error instanceof PdfToolError) return error;
  if (error instanceof Error && error.name === "AbortError") return error;
  if (
    error instanceof ProcessFailure &&
    (error.kind === "output" ||
      (error.kind === "exit" && (error.exitCode === 1 || error.exitCode === 3)))
  ) {
    return invalidPdf();
  }
  return new PdfToolError("processing_failed");
}

type SpawnedProcess = Readonly<{
  stdout: Readable;
  stderr: Readable;
  kill(signal: NodeJS.Signals): boolean;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
}>;

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    shell: false;
    stdio: readonly ["ignore", "pipe", "pipe"];
  }>,
) => SpawnedProcess;

type SharpPipeline = Readonly<{
  resize(options: { width: number; withoutEnlargement: boolean }): Readonly<{
    webp(options: { quality: number }): Readonly<{
      toBuffer(): Promise<Buffer>;
    }>;
  }>;
}>;

type SharpFactory = (
  input: string,
  options: { limitInputPixels: number },
) => SharpPipeline;

type PdfToolFileStore = Readonly<{
  createStage(extension: ".webp"): Promise<DownloadStage>;
}>;

type Dependencies = Readonly<{
  spawnProcess?: SpawnProcess;
  sharpFactory?: SharpFactory;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}>;

async function validatePdfPrefix(pdfPath: string) {
  const handle = await open(pdfPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw invalidPdf();
    const prefix = Buffer.alloc(5);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (bytesRead !== prefix.length || prefix.toString("ascii") !== "%PDF-") {
      throw invalidPdf();
    }
  } finally {
    await handle.close();
  }
}

function pageCountFrom(output: string) {
  if (/^Encrypted:[ \t]+yes(?:[ \t]|$)/imu.test(output)) {
    throw invalidPdf();
  }
  const pages = output
    .split(/\r?\n/u)
    .map((line) => /^Pages:[ \t]+(0|[1-9][0-9]*)[ \t]*$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  if (pages.length !== 1) throw invalidPdf();
  const count = Number(pages[0]![1]);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PAGES) {
    throw invalidPdf();
  }
  return count;
}

async function discardStage(stage: DownloadStage) {
  const errors: unknown[] = [];
  await stage.writable.close().catch((error: unknown) => errors.push(error));
  await unlink(stage.path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") errors.push(error);
  });
  if (errors.length > 0) {
    throw new AggregateError(errors, "Cover stage cleanup failed");
  }
}

function abortError(operation: string) {
  const error = new Error(`${operation} aborted`);
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined, operation: string) {
  if (signal?.aborted) throw abortError(operation);
}

export function createPdfTools(dependencies: Dependencies = {}) {
  const spawnProcess = dependencies.spawnProcess ?? (spawn as SpawnProcess);
  const sharpFactory = dependencies.sharpFactory ?? (sharp as SharpFactory);
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;

  async function run(
    command: string,
    args: readonly string[],
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal, command);
    const child = spawnProcess(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let failure: Error | undefined;

    function stop(error: Error) {
      if (failure) return;
      failure = error;
      child.kill("SIGKILL");
    }

    function collect(target: Buffer[], chunk: Buffer | string) {
      if (failure) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += bytes.length;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        stop(new ProcessFailure("output"));
        return;
      }
      target.push(bytes);
    }

    child.stdout.on("data", (chunk: Buffer | string) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer | string) => collect(stderr, chunk));

    return await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const onAbort = () => stop(abortError(command));
        const timer = setTimer(() => {
          stop(new ProcessFailure("timeout"));
        }, PROCESS_TIMEOUT_MS);
        child.once("error", () => {
          failure ??= new ProcessFailure("spawn");
        });
        child.once("close", (code, exitSignal) => {
          clearTimer(timer);
          signal?.removeEventListener("abort", onAbort);
          if (failure) {
            reject(failure);
            return;
          }
          if (code !== 0) {
            reject(new ProcessFailure(exitSignal ? "signal" : "exit", code));
            return;
          }
          resolve({
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
          });
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
      },
    );
  }

  return {
    async derive(
      pdfPath: string,
      fileStore: PdfToolFileStore,
      signal?: AbortSignal,
    ) {
      let temporaryDirectory: string | undefined;
      let stagedCover: DownloadStage | undefined;
      try {
        throwIfAborted(signal, "PDF processing");
        await validatePdfPrefix(pdfPath);
        throwIfAborted(signal, "PDF processing");
        const information = await run("pdfinfo", [pdfPath], signal);
        if (information.stderr.trim() !== "") throw invalidPdf();
        const pageCount = pageCountFrom(information.stdout);
        throwIfAborted(signal, "PDF processing");
        temporaryDirectory = await mkdtemp(
          path.join(tmpdir(), "download-cover-"),
        );
        const outputPrefix = path.join(temporaryDirectory, "page-1");
        await run(
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
            pdfPath,
            outputPrefix,
          ],
          signal,
        );
        throwIfAborted(signal, "PDF processing");
        const pngPath = `${outputPrefix}.png`;
        const png = await lstat(pngPath);
        if (png.isSymbolicLink() || !png.isFile()) {
          throw new Error("Rendered PNG must be a regular file");
        }
        if (png.size > MAX_PNG_BYTES) throw invalidPdf();

        throwIfAborted(signal, "PDF processing");
        stagedCover = await fileStore.createStage(".webp");
        throwIfAborted(signal, "PDF processing");
        const webp = await sharpFactory(pngPath, {
          limitInputPixels: 40_000_000,
        })
          .resize({ width: 640, withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer();
        throwIfAborted(signal, "PDF processing");
        await stagedCover.writable.writeFile(webp);
        throwIfAborted(signal, "PDF processing");
        await rm(temporaryDirectory, { recursive: true, force: true });
        temporaryDirectory = undefined;
        return { pageCount, stagedCover } as const;
      } catch (caught) {
        const error = classify(caught);
        const cleanupErrors: unknown[] = [];
        if (stagedCover) {
          await discardStage(stagedCover).catch((cleanupError: unknown) =>
            cleanupErrors.push(cleanupError),
          );
        }
        if (temporaryDirectory) {
          await rm(temporaryDirectory, { recursive: true, force: true }).catch(
            (cleanupError: unknown) => cleanupErrors.push(cleanupError),
          );
        }
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            "PDF cover cleanup failed",
          );
        }
        throw error;
      }
    },
  };
}

export const pdfTools = createPdfTools();
