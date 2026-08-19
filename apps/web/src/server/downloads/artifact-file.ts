import "server-only";

export type ArtifactSlot = "document" | "windows" | "macos";

type ArtifactFileType = Readonly<{
  mediaType: string;
  signatures?: readonly Buffer[];
  trailer?: Buffer;
}>;

const PDF = Buffer.from("%PDF-");
const EXE = Buffer.from("MZ");
const MSI = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = [
  Buffer.from("PK\x03\x04"),
  Buffer.from("PK\x05\x06"),
  Buffer.from("PK\x07\x08"),
];
const DMG = Buffer.from("koly");
const PKG = Buffer.from("xar!");

export const ARTIFACT_FILE_TYPES: Readonly<
  Record<ArtifactSlot, Readonly<Record<string, ArtifactFileType>>>
> = {
  document: {
    ".pdf": { mediaType: "application/pdf", signatures: [PDF] },
  },
  windows: {
    ".exe": {
      mediaType: "application/vnd.microsoft.portable-executable",
      signatures: [EXE],
    },
    ".msi": { mediaType: "application/x-msi", signatures: [MSI] },
    ".zip": { mediaType: "application/zip", signatures: ZIP },
  },
  macos: {
    ".dmg": { mediaType: "application/x-apple-diskimage", trailer: DMG },
    ".pkg": {
      mediaType: "application/vnd.apple.installer+xml",
      signatures: [PKG],
    },
    ".zip": { mediaType: "application/zip", signatures: ZIP },
  },
};

export type DetectArtifactInput = Readonly<{
  slot: ArtifactSlot;
  filename: string;
  prefix: Buffer;
  suffix: Buffer;
}>;

function invalidArtifact(): never {
  throw new Error("INVALID_DOWNLOAD_ARTIFACT");
}

function hasPrefix(value: Buffer, signature: Buffer) {
  return value.subarray(0, signature.byteLength).equals(signature);
}

function hasValidSignature(
  type: ArtifactFileType,
  prefix: Buffer,
  suffix: Buffer,
) {
  if (type.trailer) {
    return suffix.byteLength === 512 && hasPrefix(suffix, type.trailer);
  }
  return type.signatures?.some((signature) => hasPrefix(prefix, signature));
}

export function sanitizeArtifactFilename(filename: string) {
  if (typeof filename !== "string") return invalidArtifact();
  const leaf = (filename.replaceAll("\\", "/").split("/").at(-1) ?? "")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, "_")
    .trim();
  if (
    !leaf ||
    Buffer.byteLength(leaf, "utf8") > 255 ||
    /^[.\s]*$/u.test(leaf)
  ) {
    return invalidArtifact();
  }
  return leaf;
}

export function detectArtifact({
  slot,
  filename,
  prefix,
  suffix,
}: DetectArtifactInput) {
  const cleanFilename = sanitizeArtifactFilename(filename);
  const extension = /\.[A-Za-z0-9]+$/u.exec(cleanFilename)?.[0]?.toLowerCase();
  if (!extension) return invalidArtifact();

  const type = ARTIFACT_FILE_TYPES[slot]?.[extension];
  if (!type || !hasValidSignature(type, prefix, suffix)) {
    return invalidArtifact();
  }
  return { extension, mediaType: type.mediaType };
}
