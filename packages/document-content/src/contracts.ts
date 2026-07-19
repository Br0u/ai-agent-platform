import { createHash } from "node:crypto";
import { z } from "zod";

export const DOCUMENT_LIMITS = {
  sourceBytes: 256 * 1024,
  slug: 96,
  title: 160,
  headingId: 192,
  summary: 500,
  navigationLabel: 80,
  navigationCode: 32,
  position: 10_000,
  astNodes: 10_000,
  nestingDepth: 32,
  headings: 256,
  codeBlockBytes: 32 * 1024,
  renderModelBytes: 512 * 1024,
} as const;

export const DOCUMENT_HEADING_ID_PREFIX = "doc-content-" as const;

export type DocumentNavigation = {
  label: string;
  code: string;
  position: number;
};

export type Heading = {
  id: string;
  title: string;
  depth: number;
};

export type SafeHastPropertyValue = string | number | boolean | string[];

export type SafeHastText = {
  type: "text";
  value: string;
};

export type SafeHastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, SafeHastPropertyValue>;
  children: SafeHastNode[];
};

export type SafeHastNode = SafeHastText | SafeHastElement;

export type SafeHastRoot = {
  type: "root";
  children: SafeHastNode[];
};

export type SafeDocumentBodyV1 = {
  format: "safe-markdown-v1";
  source: string;
  checksum: string;
  navigation: DocumentNavigation;
  renderModel: {
    version: 1;
    root: SafeHastRoot;
    toc: Heading[];
  };
};

export type DocumentDraftInput = {
  slug: string;
  title: string;
  summary: string;
  source: string;
  navigation: DocumentNavigation;
};

const navigationSchema = z
  .object({
    label: z.string().trim().min(1).max(DOCUMENT_LIMITS.navigationLabel),
    code: z
      .string()
      .min(1)
      .max(DOCUMENT_LIMITS.navigationCode)
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/),
    position: z.number().int().min(0).max(DOCUMENT_LIMITS.position),
  })
  .strict();

const documentDraftInputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(DOCUMENT_LIMITS.slug)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(DOCUMENT_LIMITS.title),
    summary: z.string().trim().min(1).max(DOCUMENT_LIMITS.summary),
    source: z.string().min(1),
    navigation: navigationSchema,
  })
  .strict();

export const SAFE_HAST_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "document-callout",
  "document-cards",
  "document-filetree",
  "document-steps",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

const allowedTags = new Set<string>(SAFE_HAST_TAGS);
const allowedProperties: Record<string, ReadonlySet<string>> = {
  a: new Set(["href"]),
  code: new Set(["className"]),
  "document-callout": new Set(["dataCalloutType"]),
  h1: new Set(["id"]),
  h2: new Set(["id"]),
  h3: new Set(["id"]),
  h4: new Set(["id"]),
  h5: new Set(["id"]),
  h6: new Set(["id"]),
  img: new Set(["alt", "src", "title"]),
  input: new Set(["checked", "disabled", "type"]),
  ol: new Set(["start"]),
  td: new Set(["align"]),
  th: new Set(["align"]),
};

const safePropertyValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);

const safeHastTextSchema = z
  .object({ type: z.literal("text"), value: z.string() })
  .strict();

const safeHastNodeSchema: z.ZodType<SafeHastNode> = z.lazy(() =>
  z.union([safeHastTextSchema, safeHastElementSchema]),
);

const safeHastElementSchema: z.ZodType<SafeHastElement> = z.lazy(() =>
  z
    .object({
      type: z.literal("element"),
      tagName: z.string(),
      properties: z.record(z.string(), safePropertyValueSchema),
      children: z.array(safeHastNodeSchema),
    })
    .strict()
    .superRefine((element, context) => {
      if (!allowedTags.has(element.tagName)) {
        context.addIssue({ code: "custom", message: "unsafe tag" });
        return;
      }

      const allowed = allowedProperties[element.tagName] ?? new Set<string>();
      for (const property of Object.keys(element.properties)) {
        if (!allowed.has(property)) {
          context.addIssue({ code: "custom", message: "unsafe property" });
        }
      }

      if (
        element.tagName === "a" &&
        !isSafeDocumentLink(element.properties.href)
      ) {
        context.addIssue({ code: "custom", message: "unsafe link" });
      }
      if (
        element.tagName === "img" &&
        !isSafeDocumentImage(element.properties.src)
      ) {
        context.addIssue({ code: "custom", message: "unsafe image" });
      }
      if (
        element.tagName === "document-callout" &&
        !isCalloutType(element.properties.dataCalloutType)
      ) {
        context.addIssue({ code: "custom", message: "unsafe callout" });
      }
      if (
        /^h[1-6]$/.test(element.tagName) &&
        !isSafeHeadingId(element.properties.id)
      ) {
        context.addIssue({ code: "custom", message: "unsafe heading id" });
      }
      if (!hasSafePropertyValues(element)) {
        context.addIssue({ code: "custom", message: "unsafe property value" });
      }
    }),
);

const recursiveSafeHastRootSchema: z.ZodType<SafeHastRoot> = z
  .object({
    type: z.literal("root"),
    children: z.array(safeHastNodeSchema),
  })
  .strict()
  .superRefine((root, context) => {
    const stack = root.children.map((node) => ({ node, depth: 1 }));
    let nodes = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      nodes += 1;
      if (
        nodes > DOCUMENT_LIMITS.astNodes ||
        current.depth > DOCUMENT_LIMITS.nestingDepth
      ) {
        context.addIssue({ code: "custom", message: "unsafe tree size" });
        return;
      }
      if (current.node.type === "element") {
        for (const child of current.node.children) {
          stack.push({ node: child, depth: current.depth + 1 });
        }
      }
    }
  });

export const safeHastRootSchema: z.ZodType<SafeHastRoot> = z
  .custom<SafeHastRoot>((input) => preflightSafeHastRoot(input), {
    message: "HAST exceeds structural limits",
  })
  .pipe(recursiveSafeHastRootSchema as z.ZodType<SafeHastRoot, SafeHastRoot>);

const headingSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(DOCUMENT_LIMITS.headingId + DOCUMENT_HEADING_ID_PREFIX.length)
      .refine(isSafeHeadingId),
    title: z.string().min(1).max(DOCUMENT_LIMITS.title),
    depth: z.number().int().min(1).max(6),
  })
  .strict();

const recursiveSafeDocumentBodyV1Schema: z.ZodType<SafeDocumentBodyV1> = z
  .object({
    format: z.literal("safe-markdown-v1"),
    source: z.string().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    navigation: navigationSchema,
    renderModel: z
      .object({
        version: z.literal(1),
        root: safeHastRootSchema,
        toc: z.array(headingSchema).max(DOCUMENT_LIMITS.headings),
      })
      .strict(),
  })
  .strict()
  .superRefine((body, context) => {
    if (Buffer.byteLength(body.source, "utf8") > DOCUMENT_LIMITS.sourceBytes) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "source too large",
      });
    }

    const { checksum, ...unsignedBody } = body;
    if (computeSafeDocumentChecksum(unsignedBody) !== checksum) {
      context.addIssue({
        code: "custom",
        path: ["checksum"],
        message: "checksum mismatch",
      });
    }
  });

const boundedSafeDocumentBodySchema = z.custom<SafeDocumentBodyV1>(
  (input) => preflightSafeDocumentBody(input).success,
  { message: "document body exceeds structural limits" },
);

export const safeDocumentBodyV1Schema: z.ZodType<SafeDocumentBodyV1> =
  boundedSafeDocumentBodySchema.pipe(
    recursiveSafeDocumentBodyV1Schema as z.ZodType<
      SafeDocumentBodyV1,
      SafeDocumentBodyV1
    >,
  );

export function parseSafeDocumentBodyV1(input: unknown): SafeDocumentBodyV1 {
  const preflight = preflightSafeDocumentBody(input);
  if (!preflight.success) {
    throw new Error(`DOCUMENT_INPUT_INVALID:${preflight.path}`);
  }

  const parsed = safeDocumentBodyV1Schema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") || "body";
    throw new Error(`DOCUMENT_INPUT_INVALID:${field}`);
  }
  return parsed.data;
}

export function computeSafeDocumentChecksum(
  body: Omit<SafeDocumentBodyV1, "checksum">,
): string {
  return createHash("sha256").update(canonicalJson(body), "utf8").digest("hex");
}

export function parseDocumentDraft(input: unknown): DocumentDraftInput {
  if (
    typeof input === "object" &&
    input !== null &&
    "source" in input &&
    typeof input.source === "string" &&
    Buffer.byteLength(input.source, "utf8") > DOCUMENT_LIMITS.sourceBytes
  ) {
    throw new Error("DOCUMENT_INPUT_TOO_LARGE:source");
  }

  const parsed = documentDraftInputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") || "input";
    throw new Error(`DOCUMENT_INPUT_INVALID:${field}`);
  }

  return parsed.data;
}

export const CALLOUT_TYPES = ["info", "warning", "important"] as const;

export function isCalloutType(
  value: unknown,
): value is (typeof CALLOUT_TYPES)[number] {
  return typeof value === "string" && CALLOUT_TYPES.includes(value as never);
}

export function isSafeDocumentLink(value: unknown): value is string {
  return isSafeDocumentLinkWithFragment(value, isSafeHeadingId);
}

export function isSafeDocumentSourceLink(value: unknown): value is string {
  return isSafeDocumentLinkWithFragment(value, isSafeGeneratedSlug);
}

function isSafeDocumentLinkWithFragment(
  value: unknown,
  isSafeFragment: (fragment: unknown) => fragment is string,
): value is string {
  if (typeof value !== "string" || /[%\\\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }

  if (value.startsWith("https://")) {
    return isNormalizedHttpsLink(value);
  }

  if (value.startsWith("#")) {
    return isSafeFragment(value.slice(1));
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("?")) {
    return false;
  }

  const [path, fragment, ...rest] = value.split("#");
  if (rest.length > 0 || !isNormalizedPath(path)) return false;
  return fragment === undefined || isSafeFragment(fragment);
}

export function isSafeDocumentImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/assets/") &&
    !value.includes("#") &&
    !value.includes("?") &&
    !/[%&\\\u0000-\u001f\u007f]/u.test(value) &&
    isNormalizedPath(value)
  );
}

function isNormalizedPath(path: string): boolean {
  if (path === "/") return true;
  if (path !== "/" && path.endsWith("/")) return false;
  const segments = path.split("/").slice(1);
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      /^[\p{L}\p{N}._~-]+$/u.test(segment),
  );
}

function isSafeHeadingId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(DOCUMENT_HEADING_ID_PREFIX) &&
    isSafeGeneratedSlug(value.slice(DOCUMENT_HEADING_ID_PREFIX.length))
  );
}

function isSafeGeneratedSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= DOCUMENT_LIMITS.headingId &&
    !/[\s\u0000-\u001f\u007f"'`<>&%\\/#?=]/u.test(value)
  );
}

function hasSafePropertyValues(element: SafeHastElement): boolean {
  const properties = element.properties;
  if (element.tagName === "code") {
    return (
      properties.className === undefined ||
      (Array.isArray(properties.className) &&
        properties.className.every((value) =>
          /^language-[A-Za-z0-9_+-]{1,32}$/u.test(value),
        ))
    );
  }
  if (element.tagName === "img") {
    return (
      typeof properties.alt === "string" &&
      (properties.title === undefined || typeof properties.title === "string")
    );
  }
  if (element.tagName === "input") {
    return (
      properties.type === "checkbox" &&
      properties.disabled === true &&
      typeof properties.checked === "boolean"
    );
  }
  if (element.tagName === "ol") {
    return (
      properties.start === undefined ||
      (typeof properties.start === "number" &&
        Number.isInteger(properties.start) &&
        properties.start >= 1 &&
        properties.start <= DOCUMENT_LIMITS.position)
    );
  }
  if (element.tagName === "td" || element.tagName === "th") {
    return (
      properties.align === undefined ||
      properties.align === "left" ||
      properties.align === "center" ||
      properties.align === "right"
    );
  }
  return true;
}

function isNormalizedHttpsLink(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      !isNormalizedPath(url.pathname)
    ) {
      return false;
    }

    return (
      url.href === value ||
      (url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        url.href.slice(0, -1) === value)
    );
  } catch {
    return false;
  }
}

type PreflightResult = { success: true } | { success: false; path: string };

function preflightSafeDocumentBody(input: unknown): PreflightResult {
  const rootRecord = asUnknownRecord(input);
  if (!rootRecord) return { success: false, path: "body" };

  const renderModel = asUnknownRecord(rootRecord.renderModel);
  const renderRoot = renderModel
    ? asUnknownRecord(renderModel.root)
    : undefined;
  if (renderRoot && !preflightSafeHastRoot(renderRoot)) {
    return { success: false, path: "renderModel.root" };
  }

  const stack: Array<{
    value: unknown;
    depth: number;
    path: string;
    renderModel: boolean;
  }> = [{ value: input, depth: 0, path: "body", renderModel: false }];
  const seen = new WeakSet<object>();
  let values = 0;
  let bodyBytes = 0;
  let renderModelBytes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    values += 1;
    if (
      values > DOCUMENT_LIMITS.astNodes * 8 ||
      current.depth > DOCUMENT_LIMITS.nestingDepth * 3 + 16
    ) {
      return { success: false, path: current.path };
    }

    if (typeof current.value === "string") {
      const bytes = Buffer.byteLength(current.value, "utf8");
      bodyBytes += bytes;
      if (current.renderModel) renderModelBytes += bytes;
    } else if (typeof current.value === "object" && current.value !== null) {
      if (seen.has(current.value)) {
        return { success: false, path: current.path };
      }
      seen.add(current.value);
      const entries = Array.isArray(current.value)
        ? current.value.map((value) => ["", value] as const)
        : Object.entries(current.value);
      for (const [key, value] of entries) {
        const keyBytes = Buffer.byteLength(key, "utf8");
        bodyBytes += keyBytes;
        if (current.renderModel) renderModelBytes += keyBytes;
        const childIsRenderModel =
          current.renderModel ||
          (current.path === "body" && key === "renderModel");
        stack.push({
          value,
          depth: current.depth + 1,
          path:
            current.path === "body" && key
              ? key
              : childIsRenderModel
                ? "renderModel"
                : current.path,
          renderModel: childIsRenderModel,
        });
      }
    } else {
      bodyBytes += 8;
      if (current.renderModel) renderModelBytes += 8;
    }

    if (renderModelBytes > DOCUMENT_LIMITS.renderModelBytes) {
      return { success: false, path: "renderModel" };
    }
    if (
      bodyBytes >
      DOCUMENT_LIMITS.sourceBytes + DOCUMENT_LIMITS.renderModelBytes + 64 * 1024
    ) {
      return { success: false, path: current.path };
    }
  }

  return { success: true };
}

function preflightSafeHastRoot(input: unknown): boolean {
  const root = asUnknownRecord(input);
  if (!root) return true;
  if (!isBoundedUnknownPayload(input, DOCUMENT_LIMITS.renderModelBytes)) {
    return false;
  }
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 0 },
  ];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (
      nodes > DOCUMENT_LIMITS.astNodes ||
      current.depth > DOCUMENT_LIMITS.nestingDepth
    ) {
      return false;
    }
    const record = asUnknownRecord(current.value);
    if (record && Array.isArray(record.children)) {
      for (const child of record.children) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return true;
}

function isBoundedUnknownPayload(input: unknown, maxBytes: number): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: input, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  let bytes = 0;
  let values = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    values += 1;
    if (
      values > DOCUMENT_LIMITS.astNodes * 8 ||
      current.depth > DOCUMENT_LIMITS.nestingDepth * 3 + 16
    ) {
      return false;
    }
    if (typeof current.value === "string") {
      bytes += Buffer.byteLength(current.value, "utf8");
    } else if (typeof current.value === "object" && current.value !== null) {
      if (seen.has(current.value)) return false;
      seen.add(current.value);
      const entries = Array.isArray(current.value)
        ? current.value.map((value) => ["", value] as const)
        : Object.entries(current.value);
      for (const [key, value] of entries) {
        bytes += Buffer.byteLength(key, "utf8");
        stack.push({ value, depth: current.depth + 1 });
      }
    } else {
      bytes += 8;
    }
    if (bytes > maxBytes) return false;
  }
  return true;
}

function asUnknownRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
