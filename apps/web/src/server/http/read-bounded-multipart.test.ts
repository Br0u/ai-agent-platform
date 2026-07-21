import { describe, expect, it, vi } from "vitest";

import {
  BoundedMultipartError,
  readBoundedSkillUploadMultipart,
} from "./read-bounded-multipart";

const BOUNDARY = "----aap-skill-boundary";
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
const SKILL_ID = "33333333-3333-4333-8333-333333333333";

type Part =
  | { name: string; value: string }
  | {
      name: string;
      filename: string;
      contentType: string;
      value: Uint8Array;
    };

function multipart(parts: Part[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (const part of parts) {
    chunks.push(encoder.encode(`--${BOUNDARY}\r\n`));
    if ("filename" in part) {
      chunks.push(
        encoder.encode(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
        ),
      );
      chunks.push(part.value);
      chunks.push(encoder.encode("\r\n"));
    } else {
      chunks.push(
        encoder.encode(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
        ),
      );
    }
  }
  chunks.push(encoder.encode(`--${BOUNDARY}--\r\n`));
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function request(
  parts: Part[],
  options: { contentType?: string; contentLength?: string } = {},
): Request {
  const body = multipart(parts);
  return new Request("https://admin.example.test/uploads", {
    method: "POST",
    headers: {
      "content-type":
        options.contentType ?? `multipart/form-data; boundary=${BOUNDARY}`,
      "content-length": options.contentLength ?? String(body.byteLength),
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

const archivePart: Part = {
  name: "archive",
  filename: "safe.zip",
  contentType: "application/zip",
  value: ZIP,
};

describe("bounded skill upload multipart", () => {
  it("streams one archive and an optional canonical target skill id", async () => {
    const current = request([
      archivePart,
      { name: "targetSkillId", value: SKILL_ID },
    ]);
    const formData = vi.spyOn(current, "formData");

    await expect(readBoundedSkillUploadMultipart(current)).resolves.toEqual({
      archive: ZIP,
      targetSkillId: SKILL_ID,
    });
    expect(formData).not.toHaveBeenCalled();
  });

  it.each([
    ["missing boundary", { contentType: "multipart/form-data" }],
    ["wrong media", { contentType: "application/json" }],
    ["oversized declared", { contentLength: String(5 * 1024 * 1024 + 65_537) }],
    ["ambiguous length", { contentLength: "1, 2" }],
  ])("rejects %s before consuming the body", async (_name, headers) => {
    const current = request([archivePart], headers);
    const reader = current.body?.getReader();
    reader?.releaseLock();

    await expect(
      readBoundedSkillUploadMultipart(current),
    ).rejects.toBeInstanceOf(BoundedMultipartError);
  });

  it.each([
    ["missing archive", [{ name: "targetSkillId", value: SKILL_ID }]],
    ["duplicate archive", [archivePart, archivePart]],
    [
      "duplicate target",
      [
        archivePart,
        { name: "targetSkillId", value: SKILL_ID },
        { name: "targetSkillId", value: SKILL_ID },
      ],
    ],
    ["extra text field", [archivePart, { name: "notes", value: "no" }]],
    ["extra file field", [archivePart, { ...archivePart, name: "source" }]],
    [
      "non zip media",
      [{ ...archivePart, contentType: "application/octet-stream" }],
    ],
    [
      "non zip bytes",
      [{ ...archivePart, value: new TextEncoder().encode("not-a-zip") }],
    ],
    [
      "invalid target uuid",
      [archivePart, { name: "targetSkillId", value: "../escape" }],
    ],
  ] as const)("rejects %s fail-closed", async (_name, parts) => {
    await expect(
      readBoundedSkillUploadMultipart(request([...parts] as Part[])),
    ).rejects.toBeInstanceOf(BoundedMultipartError);
  });

  it("rejects archive and raw-body chunk overruns", async () => {
    const oversizedZip = new Uint8Array(5 * 1024 * 1024 + 1);
    oversizedZip.set(ZIP);
    const archiveTooLarge = request([{ ...archivePart, value: oversizedZip }]);
    archiveTooLarge.headers.delete("content-length");
    await expect(
      readBoundedSkillUploadMultipart(archiveTooLarge),
    ).rejects.toMatchObject({ code: "archive_too_large" });

    const rawPadding = "x".repeat(65_537);
    const rawTooLarge = request([
      { ...archivePart, value: new Uint8Array(5 * 1024 * 1024) },
      { name: "targetSkillId", value: rawPadding },
    ]);
    rawTooLarge.headers.delete("content-length");
    await expect(
      readBoundedSkillUploadMultipart(rawTooLarge),
    ).rejects.toMatchObject({ code: "body_too_large" });
  });

  it("cancels the source stream immediately on a raw-body overrun", async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(5 * 1024 * 1024 + 64 * 1024 + 1);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel,
    });
    const current = new Request("https://admin.example.test/uploads", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(
      readBoundedSkillUploadMultipart(current),
    ).rejects.toMatchObject({ code: "body_too_large" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancel.mock.calls[0]?.[0]).toBeInstanceOf(BoundedMultipartError);
  });

  it("rejects an already consumed or absent request body", async () => {
    const consumed = request([archivePart]);
    await consumed.arrayBuffer();
    await expect(
      readBoundedSkillUploadMultipart(consumed),
    ).rejects.toBeInstanceOf(BoundedMultipartError);
    await expect(
      readBoundedSkillUploadMultipart(
        new Request("https://admin.example.test/uploads", {
          method: "POST",
          headers: {
            "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(BoundedMultipartError);
  });
});
