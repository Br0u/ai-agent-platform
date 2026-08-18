import { describe, expect, it } from "vitest";

import { detectArtifact, sanitizeArtifactFilename } from "./artifact-file";

const CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const DMG_TRAILER = Buffer.concat([Buffer.from("koly"), Buffer.alloc(508)]);

describe("artifact file recognition", () => {
  it.each([
    [
      "document PDF",
      "document",
      "guide.pdf",
      Buffer.from("%PDF-1.7"),
      ".pdf",
      "application/pdf",
    ],
    [
      "Windows EXE",
      "windows",
      "mario.exe",
      Buffer.from("MZ"),
      ".exe",
      "application/vnd.microsoft.portable-executable",
    ],
    ["Windows MSI", "windows", "mario.msi", CFB, ".msi", "application/x-msi"],
    [
      "Windows ZIP local header",
      "windows",
      "mario.zip",
      Buffer.from("PK\x03\x04"),
      ".zip",
      "application/zip",
    ],
    [
      "Windows ZIP empty archive",
      "windows",
      "mario.zip",
      Buffer.from("PK\x05\x06"),
      ".zip",
      "application/zip",
    ],
    [
      "Windows ZIP data descriptor",
      "windows",
      "mario.zip",
      Buffer.from("PK\x07\x08"),
      ".zip",
      "application/zip",
    ],
    [
      "macOS DMG",
      "macos",
      "mario.dmg",
      Buffer.alloc(0),
      ".dmg",
      "application/x-apple-diskimage",
    ],
    [
      "macOS PKG",
      "macos",
      "mario.pkg",
      Buffer.from("xar!"),
      ".pkg",
      "application/vnd.apple.installer+xml",
    ],
    [
      "macOS ZIP",
      "macos",
      "mario.zip",
      Buffer.from("PK\x03\x04"),
      ".zip",
      "application/zip",
    ],
  ] as const)(
    "accepts %s",
    (_name, slot, filename, prefix, extension, mediaType) => {
      expect(
        detectArtifact({
          slot,
          filename,
          prefix,
          suffix: DMG_TRAILER,
        }),
      ).toEqual({ extension, mediaType });
    },
  );

  it("keeps only a safe filename leaf before extension recognition", () => {
    expect(sanitizeArtifactFilename("C:\\fakepath\\Release<1>.EXE")).toBe(
      "Release_1_.EXE",
    );
    expect(
      detectArtifact({
        slot: "windows",
        filename: "C:\\fakepath\\Release.EXE",
        prefix: Buffer.from("MZ"),
        suffix: Buffer.alloc(512),
      }),
    ).toEqual({
      extension: ".exe",
      mediaType: "application/vnd.microsoft.portable-executable",
    });
  });

  it.each([
    [
      "a valid signature in the wrong slot",
      "macos",
      "fake.dmg",
      Buffer.from("MZ"),
      Buffer.alloc(512),
    ],
    [
      "an extension that is not allowed in the slot",
      "windows",
      "fake.dmg",
      Buffer.alloc(0),
      DMG_TRAILER,
    ],
    [
      "a fake extension",
      "windows",
      "fake.exe",
      Buffer.from("not an executable"),
      Buffer.alloc(512),
    ],
    [
      "a short DMG trailer",
      "macos",
      "fake.dmg",
      Buffer.alloc(0),
      Buffer.from("koly"),
    ],
    [
      "an unknown slot",
      "linux",
      "fake.zip",
      Buffer.from("PK\x03\x04"),
      Buffer.alloc(512),
    ],
  ] as const)("rejects %s", (_name, slot, filename, prefix, suffix) => {
    expect(() =>
      detectArtifact({
        slot: slot as "document" | "windows" | "macos",
        filename,
        prefix,
        suffix,
      }),
    ).toThrow("INVALID_DOWNLOAD_ARTIFACT");
  });
});
