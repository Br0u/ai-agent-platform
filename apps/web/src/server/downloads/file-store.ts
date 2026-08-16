import { randomUUID } from "node:crypto";
import {
  chmod,
  constants,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open as openFile,
  unlink,
} from "node:fs/promises";
import path from "node:path";

const DIRECTORY_MODE = 0o750;
const FILE_MODE = 0o640;
const UUID_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_SEGMENT}$`, "u");
const OBJECT_KEY = new RegExp(
  `^objects/(${UUID_SEGMENT})/(${UUID_SEGMENT})\\.(pdf|webp)$`,
  "u",
);

export type DownloadArtifactKind = "pdf" | "cover";
export type DownloadStageExtension = ".pdf" | ".webp";
export type DownloadStage = Readonly<{
  path: string;
  writable: FileHandle;
}>;

type StageState = {
  consumed: boolean;
  extension: DownloadStageExtension;
};

type CommitInput = Readonly<{
  resourceId: string;
  revisionId: string;
  kind: DownloadArtifactKind;
}>;

type ByteRange = Readonly<{ start: number; end: number }>;

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function validateUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new Error(`Invalid ${label} ID`);
}

function extensionFor(kind: DownloadArtifactKind) {
  if (kind === "pdf") return ".pdf";
  if (kind === "cover") return ".webp";
  throw new Error("Invalid artifact kind");
}

async function safeDirectory(directory: string, create: boolean) {
  if (create) {
    try {
      await mkdir(directory, { mode: DIRECTORY_MODE });
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
    }
  }
  const stats = await lstat(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("Artifact directory must be a real directory");
  }
  if (create) await chmod(directory, DIRECTORY_MODE);
}

async function unlinkIfPresent(filePath: string) {
  await unlink(filePath).catch((error: unknown) => {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  });
}

export function createDownloadFileStore(configuredRoot: string) {
  const root = path.resolve(configuredRoot);
  const stages = new WeakMap<DownloadStage, StageState>();

  async function ensureRoot(create: boolean) {
    if (create) {
      await mkdir(root, { mode: DIRECTORY_MODE, recursive: true });
    }
    await safeDirectory(root, false);
    if (create) await chmod(root, DIRECTORY_MODE);
  }

  async function ensureObjectParent(resourceId: string, create: boolean) {
    await ensureRoot(create);
    const objects = path.join(root, "objects");
    await safeDirectory(objects, create);
    const resourceDirectory = path.join(objects, resourceId);
    await safeDirectory(resourceDirectory, create);
    return resourceDirectory;
  }

  function parseObjectKey(objectKey: string) {
    const match = OBJECT_KEY.exec(objectKey);
    if (!match) throw new Error("Invalid object key");
    return {
      resourceId: match[1]!,
      revisionId: match[2]!,
      extension: `.${match[3]}` as DownloadStageExtension,
      path: path.join(root, objectKey),
    };
  }

  async function regularObject(objectKey: string) {
    const parsed = parseObjectKey(objectKey);
    await ensureObjectParent(parsed.resourceId, false);
    const stats = await lstat(parsed.path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("Artifact must be a regular file");
    }
    return { ...parsed, stats };
  }

  async function discardStage(stage: DownloadStage) {
    let closeError: unknown;
    try {
      await stage.writable.close();
    } catch (error) {
      closeError = error;
    }
    try {
      await unlinkIfPresent(stage.path);
    } catch (unlinkError) {
      if (closeError !== undefined) {
        throw new AggregateError(
          [closeError, unlinkError],
          "Artifact stage cleanup failed",
        );
      }
      throw unlinkError;
    }
    if (closeError !== undefined) throw closeError;
  }

  async function discardAndThrow(
    stage: DownloadStage,
    originalError: unknown,
  ): Promise<never> {
    try {
      await discardStage(stage);
    } catch (cleanupError) {
      throw new AggregateError(
        [originalError, cleanupError],
        "Artifact stage cleanup failed",
      );
    }
    throw originalError;
  }

  return {
    async createStage(extension: DownloadStageExtension) {
      if (extension !== ".pdf" && extension !== ".webp") {
        throw new Error("Invalid stage extension");
      }
      await ensureRoot(true);
      const staging = path.join(root, "staging");
      await safeDirectory(staging, true);
      const stagePath = path.join(staging, `${randomUUID()}${extension}`);
      const writable = await openFile(
        stagePath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_RDWR |
          constants.O_NOFOLLOW,
        FILE_MODE,
      );
      const stage = Object.freeze({ path: stagePath, writable });
      stages.set(stage, { consumed: false, extension });
      return stage;
    },

    async commit(stage: DownloadStage, input: CommitInput) {
      const state = stages.get(stage);
      if (!state || state.consumed)
        throw new Error("Invalid or consumed stage");
      state.consumed = true;

      let linked:
        | {
            destination: string;
            handleStats: Awaited<ReturnType<FileHandle["stat"]>>;
            objectKey: string;
          }
        | undefined;
      try {
        validateUuid(input.resourceId, "resource");
        validateUuid(input.revisionId, "revision");
        const extension = extensionFor(input.kind);
        if (state.extension !== extension) {
          throw new Error("Stage extension does not match artifact kind");
        }

        const stagedStats = await lstat(stage.path);
        if (stagedStats.isSymbolicLink() || !stagedStats.isFile()) {
          throw new Error("Stage must be a regular file");
        }
        const handleStats = await stage.writable.stat();
        if (
          stagedStats.dev !== handleStats.dev ||
          stagedStats.ino !== handleStats.ino
        ) {
          throw new Error("Stage file changed before commit");
        }

        await stage.writable.chmod(FILE_MODE);
        const securedStats = await lstat(stage.path);
        if (
          securedStats.isSymbolicLink() ||
          !securedStats.isFile() ||
          securedStats.dev !== handleStats.dev ||
          securedStats.ino !== handleStats.ino
        ) {
          throw new Error("Stage file changed before commit");
        }
        const parent = await ensureObjectParent(input.resourceId, true);
        const objectKey = `objects/${input.resourceId}/${input.revisionId}${extension}`;
        const destination = path.join(
          parent,
          `${input.revisionId}${extension}`,
        );
        await link(stage.path, destination);
        linked = { destination, handleStats, objectKey };
      } catch (error) {
        return discardAndThrow(stage, error);
      }
      if (!linked) throw new Error("Artifact link state missing");

      const publishedStats = await lstat(linked.destination).catch(
        () => undefined,
      );
      if (
        !publishedStats ||
        publishedStats.isSymbolicLink() ||
        !publishedStats.isFile() ||
        publishedStats.dev !== linked.handleStats.dev ||
        publishedStats.ino !== linked.handleStats.ino
      ) {
        const changed = new Error("Stage file changed before commit");
        try {
          await unlinkIfPresent(linked.destination);
        } catch (rollbackError) {
          let closeError: unknown;
          try {
            await stage.writable.close();
          } catch (error) {
            closeError = error;
          }
          throw new AggregateError(
            [changed, rollbackError, closeError].filter(
              (error) => error !== undefined,
            ),
            "Artifact commit rollback failed; recoverable links retained",
          );
        }
        return discardAndThrow(stage, changed);
      }

      try {
        await stage.writable.close();
      } catch (closeError) {
        try {
          await unlinkIfPresent(linked.destination);
        } catch (rollbackError) {
          let retryCloseError: unknown;
          try {
            await stage.writable.close();
          } catch (error) {
            retryCloseError = error;
          }
          throw new AggregateError(
            [closeError, rollbackError, retryCloseError].filter(
              (error) => error !== undefined,
            ),
            "Artifact commit rollback failed; recoverable links retained",
          );
        }
        return discardAndThrow(stage, closeError);
      }

      try {
        await unlink(stage.path);
      } catch (sourceError) {
        try {
          await unlinkIfPresent(linked.destination);
        } catch (rollbackError) {
          throw new AggregateError(
            [sourceError, rollbackError],
            "Artifact commit rollback failed; recoverable links retained",
          );
        }
        throw sourceError;
      }
      return linked.objectKey;
    },

    async stat(objectKey: string) {
      return (await regularObject(objectKey)).stats;
    },

    async open(objectKey: string, range?: ByteRange) {
      const object = await regularObject(objectKey);
      const handle = await openFile(
        object.path,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stats = await handle.stat();
        if (!stats.isFile()) throw new Error("Artifact must be a regular file");
        if (stats.dev !== object.stats.dev || stats.ino !== object.stats.ino) {
          throw new Error("Artifact changed before open");
        }
        const start = range?.start ?? 0;
        const end = range?.end ?? stats.size - 1;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end < start ||
          end >= stats.size
        ) {
          throw new Error("Invalid byte range");
        }
        return {
          readable: handle.createReadStream({ start, end, autoClose: true }),
          size: stats.size,
          start,
          end,
        };
      } catch (error) {
        await handle.close();
        throw error;
      }
    },

    async remove(objectKey: string) {
      let object: Awaited<ReturnType<typeof regularObject>>;
      try {
        object = await regularObject(objectKey);
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") return;
        throw error;
      }
      await unlinkIfPresent(object.path);
    },
  };
}
