import {
  chmod,
  type FileHandle,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDownloadFileStore } from "./file-store";

const resourceId = "00000000-0000-4000-8000-000000000001";
const revisionId = "0191f2a3-4567-7abc-8def-0123456789ab";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "download-store-"));
  temporaryDirectories.push(root);
  return root;
}

async function writeStage(
  store: ReturnType<typeof createDownloadFileStore>,
  extension: ".pdf" | ".webp",
  contents: string,
) {
  const stage = await store.createStage(extension);
  await stage.writable.writeFile(contents);
  return stage;
}

async function readStream(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("download artifact file store", () => {
  it.each([undefined, " \t", "downloads"])(
    "defers invalid production root %s until I/O and then fails closed",
    async (configuredRoot) => {
      vi.stubEnv("NODE_ENV", "production");
      const store = createDownloadFileStore(configuredRoot);
      const key = `objects/${resourceId}/${revisionId}.pdf`;

      await expect(store.createStage(".pdf")).rejects.toThrow(
        "DOWNLOAD_RESOURCE_ROOT must be an absolute path in production",
      );
      await expect(store.stat(key)).rejects.toThrow(
        "DOWNLOAD_RESOURCE_ROOT must be an absolute path in production",
      );
      await expect(store.open(key)).rejects.toThrow(
        "DOWNLOAD_RESOURCE_ROOT must be an absolute path in production",
      );
      await expect(store.remove(key)).rejects.toThrow(
        "DOWNLOAD_RESOURCE_ROOT must be an absolute path in production",
      );
    },
  );

  it("accepts the exact configured absolute production root", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await store.createStage(".pdf");

    expect(path.relative(root, stage.path).startsWith("staging/")).toBe(true);
    await stage.writable.close();
    await rm(stage.path);
  });

  it("uses a stable tmpdir development default", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const expectedRoot = path.join(tmpdir(), "ai-agent-platform-downloads");
    const firstStore = createDownloadFileStore();
    const secondStore = createDownloadFileStore();
    const first = await firstStore.createStage(".pdf");
    const second = await secondStore.createStage(".webp");

    expect(path.relative(expectedRoot, first.path).startsWith("staging/")).toBe(
      true,
    );
    expect(
      path.relative(expectedRoot, second.path).startsWith("staging/"),
    ).toBe(true);
    await Promise.all([first.writable.close(), second.writable.close()]);
    await Promise.all([rm(first.path), rm(second.path)]);
  });

  it("uses an explicitly injected test root", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await store.createStage(".pdf");

    expect(path.relative(root, stage.path).startsWith("staging/")).toBe(true);
    await stage.writable.close();
    await rm(stage.path);
  });

  it("generates committed keys, persists bytes, ranges reads, and removes files", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "0123456789");

    expect(path.isAbsolute(stage.path)).toBe(true);
    expect(path.relative(root, stage.path).startsWith("staging/")).toBe(true);

    const objectKey = await store.commit(stage, {
      resourceId,
      revisionId,
      kind: "pdf",
    });

    expect(objectKey).toBe(`objects/${resourceId}/${revisionId}.pdf`);
    expect(await readFile(path.join(root, objectKey), "utf8")).toBe(
      "0123456789",
    );
    expect((await store.stat(objectKey)).size).toBe(10);

    const full = await store.open(objectKey);
    expect(full).toMatchObject({ size: 10, start: 0, end: 9 });
    expect(await readStream(full.readable)).toBe("0123456789");

    const range = await store.open(objectKey, { start: 2, end: 5 });
    expect(range).toMatchObject({ size: 10, start: 2, end: 5 });
    expect(await readStream(range.readable)).toBe("2345");

    await store.remove(objectKey);
    await expect(store.stat(objectKey)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(store.remove(objectKey)).resolves.toBeUndefined();
  });

  it("commits with no-clobber semantics and preserves the original bytes", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const first = await writeStage(store, ".pdf", "original");
    const second = await writeStage(store, ".pdf", "replacement");
    const input = { resourceId, revisionId, kind: "pdf" } as const;

    const objectKey = await store.commit(first, input);
    await expect(store.commit(second, input)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(path.join(root, objectKey), "utf8")).toBe("original");
  });

  it("uses restricted modes for created directories and committed files", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".webp", "cover");
    const objectKey = await store.commit(stage, {
      resourceId,
      revisionId,
      kind: "cover",
    });

    if (process.platform !== "win32") {
      expect((await lstat(root)).mode & 0o777).toBe(0o750);
      expect((await lstat(path.join(root, "objects"))).mode & 0o777).toBe(
        0o750,
      );
      expect(
        (await lstat(path.join(root, "objects", resourceId))).mode & 0o777,
      ).toBe(0o750);
      expect((await lstat(path.join(root, objectKey))).mode & 0o777).toBe(
        0o640,
      );
    }
  });

  it.each([
    "/etc/passwd",
    "../outside.pdf",
    `objects/${resourceId}/../${revisionId}.pdf`,
    `objects/${resourceId}/${revisionId}.txt`,
    `objects/${resourceId}/nested/${revisionId}.pdf`,
    `staging/${revisionId}.pdf`,
    `objects/not-a-uuid/${revisionId}.pdf`,
    `objects/${resourceId}/00000000-0000-6000-8000-000000000001.pdf`,
    `objects/${resourceId}/00000000-0000-4000-7000-000000000001.pdf`,
  ])("rejects unsafe or non-canonical object key %s", async (objectKey) => {
    const store = createDownloadFileStore(await temporaryRoot());

    await expect(store.stat(objectKey)).rejects.toThrow("Invalid object key");
    await expect(store.open(objectKey)).rejects.toThrow("Invalid object key");
    await expect(store.remove(objectKey)).rejects.toThrow("Invalid object key");
  });

  it("rejects caller filenames, malformed IDs, mismatched extensions, and reused stages", async () => {
    const store = createDownloadFileStore(await temporaryRoot());

    await expect(
      store.createStage("../../caller.pdf" as ".pdf"),
    ).rejects.toThrow("Invalid stage extension");

    const invalidIdStage = await writeStage(store, ".pdf", "pdf");
    await expect(
      store.commit(
        { ...invalidIdStage, path: "/tmp/caller.pdf" },
        { resourceId, revisionId, kind: "pdf" },
      ),
    ).rejects.toThrow("Invalid or consumed stage");
    await expect(
      store.commit(invalidIdStage, {
        resourceId: "00000000-0000-6000-8000-000000000001",
        revisionId,
        kind: "pdf",
      }),
    ).rejects.toThrow("Invalid resource ID");

    const mismatch = await writeStage(store, ".webp", "cover");
    await expect(
      store.commit(mismatch, { resourceId, revisionId, kind: "pdf" }),
    ).rejects.toThrow("Stage extension does not match artifact kind");

    const committed = await writeStage(store, ".pdf", "pdf");
    await store.commit(committed, { resourceId, revisionId, kind: "pdf" });
    await expect(
      store.commit(committed, { resourceId, revisionId, kind: "pdf" }),
    ).rejects.toThrow("Invalid or consumed stage");
  });

  it("rejects symlinks and directories for committed operations", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const key = `objects/${resourceId}/${revisionId}.pdf`;
    const target = path.join(root, "external.pdf");
    const objectPath = path.join(root, key);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(target, "external");
    await symlink(target, objectPath);

    await expect(store.stat(key)).rejects.toThrow("must be a regular file");
    await expect(store.open(key)).rejects.toThrow("must be a regular file");
    await expect(store.remove(key)).rejects.toThrow("must be a regular file");

    await rm(objectPath);
    await mkdir(objectPath);
    await expect(store.stat(key)).rejects.toThrow("must be a regular file");
    await expect(store.open(key)).rejects.toThrow("must be a regular file");
    await expect(store.remove(key)).rejects.toThrow("must be a regular file");
  });

  it("rejects a staged path replaced with a symlink", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "original");
    const target = path.join(root, "external.pdf");
    await writeFile(target, "external");
    await stage.writable.close();
    await rm(stage.path);
    await symlink(target, stage.path);

    await expect(
      store.commit(stage, { resourceId, revisionId, kind: "pdf" }),
    ).rejects.toThrow("Stage must be a regular file");
  });

  it("rejects a source path swapped after descriptor chmod without publishing it", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "original");
    const external = path.join(root, "external.pdf");
    await writeFile(external, "external", { mode: 0o600 });
    const originalChmod = stage.writable.chmod.bind(stage.writable);
    stage.writable.chmod = async (mode) => {
      await originalChmod(mode);
      await rm(stage.path);
      await symlink(external, stage.path);
    };

    await expect(
      store.commit(stage, { resourceId, revisionId, kind: "pdf" }),
    ).rejects.toThrow("Stage file changed before commit");
    await expect(
      lstat(path.join(root, `objects/${resourceId}/${revisionId}.pdf`)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(external, "utf8")).toBe("external");
  });

  it("reports a failed destination rollback and retains recoverable links", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "recoverable");
    const destination = path.join(
      root,
      `objects/${resourceId}/${revisionId}.pdf`,
    );
    const staging = path.dirname(stage.path);
    const destinationDirectory = path.dirname(destination);
    const originalClose = stage.writable.close.bind(stage.writable);
    stage.writable.close = async () => {
      await originalClose();
      await chmod(staging, 0o550);
      await chmod(destinationDirectory, 0o550);
    };

    try {
      await expect(
        store.commit(stage, { resourceId, revisionId, kind: "pdf" }),
      ).rejects.toThrow("Artifact commit rollback failed");
    } finally {
      await chmod(staging, 0o750);
      await chmod(destinationDirectory, 0o750).catch(() => undefined);
    }
    const [stagedStats, destinationStats] = await Promise.all([
      lstat(stage.path),
      lstat(destination),
    ]);
    expect(destinationStats.ino).toBe(stagedStats.ino);
    expect(await readFile(destination, "utf8")).toBe("recoverable");
  });

  it("retries cleanup after close fails and destination rollback succeeds", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "recoverable");
    const destination = path.join(
      root,
      `objects/${resourceId}/${revisionId}.pdf`,
    );
    const originalClose = stage.writable.close.bind(stage.writable);
    let closeAttempts = 0;
    stage.writable.close = async () => {
      closeAttempts += 1;
      if (closeAttempts === 1) throw new Error("injected close failure");
      return originalClose();
    };

    await expect(
      store.commit(stage, { resourceId, revisionId, kind: "pdf" }),
    ).rejects.toThrow("injected close failure");
    expect(closeAttempts).toBe(2);
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(stage.path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stage.writable.stat()).rejects.toMatchObject({
      code: "EBADF",
    });
  });

  it("rejects an opened descriptor whose inode differs from lstat", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "original");
    const key = await store.commit(stage, {
      resourceId,
      revisionId,
      kind: "pdf",
    });
    const prototype = Object.getPrototypeOf(stage.writable) as FileHandle;
    const originalStat = prototype.stat;
    vi.spyOn(prototype, "stat").mockImplementation(async function (
      this: FileHandle,
    ) {
      const stats = await originalStat.call(this);
      Object.defineProperty(stats, "ino", {
        value: typeof stats.ino === "bigint" ? stats.ino + 1n : stats.ino + 1,
      });
      return stats;
    });

    await expect(store.open(key)).rejects.toThrow(
      "Artifact changed before open",
    );
  });

  it("treats a final remove ENOENT as success", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "original");
    const key = await store.commit(stage, {
      resourceId,
      revisionId,
      kind: "pdf",
    });
    await expect(
      Promise.all(Array.from({ length: 20 }, () => store.remove(key))),
    ).resolves.toHaveLength(20);
  });

  it("rejects invalid ranges without leaking opened file handles", async () => {
    const root = await temporaryRoot();
    const store = createDownloadFileStore(root);
    const stage = await writeStage(store, ".pdf", "12345");
    const key = await store.commit(stage, {
      resourceId,
      revisionId,
      kind: "pdf",
    });
    const descriptorDirectory =
      process.platform === "linux" ? "/proc/self/fd" : "/dev/fd";
    if (process.platform !== "win32") {
      const before = (await readdir(descriptorDirectory)).length;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(store.open(key, { start: 3, end: 2 })).rejects.toThrow(
          "Invalid byte range",
        );
      }
      expect((await readdir(descriptorDirectory)).length).toBe(before);
    }
  });
});
