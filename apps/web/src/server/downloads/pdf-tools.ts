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
    if (!stats.isFile()) throw new Error("Invalid PDF");
    const prefix = Buffer.alloc(5);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (bytesRead !== prefix.length || prefix.toString("ascii") !== "%PDF-") {
      throw new Error("Invalid PDF");
    }
  } finally {
    await handle.close();
  }
}

function pageCountFrom(output: string) {
  if (/^Encrypted:[ \t]+yes(?:[ \t]|$)/imu.test(output)) {
    throw new Error("Encrypted PDF is not supported");
  }
  const pages = output
    .split(/\r?\n/u)
    .map((line) => /^Pages:[ \t]+(0|[1-9][0-9]*)[ \t]*$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  if (pages.length !== 1) throw new Error("Invalid PDF page count");
  const count = Number(pages[0]![1]);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PAGES) {
    throw new Error("Invalid PDF page count");
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

export function createPdfTools(dependencies: Dependencies = {}) {
  const spawnProcess = dependencies.spawnProcess ?? (spawn as SpawnProcess);
  const sharpFactory = dependencies.sharpFactory ?? (sharp as SharpFactory);
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;

  async function run(command: string, args: readonly string[]) {
    const child = spawnProcess(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let failure: Error | undefined;

    function collect(target: Buffer[], chunk: Buffer | string) {
      if (failure) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += bytes.length;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        failure = new Error(`${command} output exceeded 64 KiB`);
        child.kill("SIGKILL");
        return;
      }
      target.push(bytes);
    }

    child.stdout.on("data", (chunk: Buffer | string) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer | string) => collect(stderr, chunk));

    return await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const timer = setTimer(() => {
          if (failure) return;
          failure = new Error(`${command} timed out after 15000ms`);
          child.kill("SIGKILL");
        }, PROCESS_TIMEOUT_MS);
        child.once("error", (error) => {
          failure ??= error;
        });
        child.once("close", (code, signal) => {
          clearTimer(timer);
          if (failure) {
            reject(failure);
            return;
          }
          if (code !== 0) {
            reject(
              new Error(
                `${command} failed (${code ?? signal ?? "unknown"}): ${Buffer.concat(stderr).toString("utf8")}`,
              ),
            );
            return;
          }
          resolve({
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
          });
        });
      },
    );
  }

  return {
    async derive(pdfPath: string, fileStore: PdfToolFileStore) {
      await validatePdfPrefix(pdfPath);
      const information = await run("pdfinfo", [pdfPath]);
      if (information.stderr.trim() !== "") throw new Error("Invalid PDF");
      const pageCount = pageCountFrom(information.stdout);
      let temporaryDirectory: string | undefined;
      let stagedCover: DownloadStage | undefined;
      try {
        temporaryDirectory = await mkdtemp(
          path.join(tmpdir(), "download-cover-"),
        );
        const outputPrefix = path.join(temporaryDirectory, "page-1");
        await run("pdftoppm", [
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
        ]);
        const pngPath = `${outputPrefix}.png`;
        const png = await lstat(pngPath);
        if (png.isSymbolicLink() || !png.isFile()) {
          throw new Error("Rendered PNG must be a regular file");
        }
        if (png.size > MAX_PNG_BYTES)
          throw new Error("Rendered PNG is too large");

        stagedCover = await fileStore.createStage(".webp");
        const webp = await sharpFactory(pngPath, {
          limitInputPixels: 40_000_000,
        })
          .resize({ width: 640, withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer();
        await stagedCover.writable.writeFile(webp);
        await rm(temporaryDirectory, { recursive: true, force: true });
        temporaryDirectory = undefined;
        return { pageCount, stagedCover } as const;
      } catch (error) {
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
