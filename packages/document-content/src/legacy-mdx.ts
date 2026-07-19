import { createHash } from "node:crypto";

import { isCalloutType } from "./contracts";

export const LEGACY_FIXTURE_CHECKSUMS = {
  "_meta.ts":
    "485ee0bddb55624e9971cc3e00b8f466fe967736fd5b61019de12c4451555951",
  "api.mdx": "d20cdee7d739c27d09702cee08dbfd3173d32d59d0c108aed9b20cebdb3a00cb",
  "deployment.mdx":
    "7769523a082dd0e8120de2fc1dfe5aaa12915e3cf52f0aec001c39ef03139aaf",
  "faq.mdx": "06e8dc6fa754957e802d50628c246a55088f8592ca34f88254487483bae675e1",
  "hardware.mdx":
    "dd24988970e1397274f68e7900dd0b90b8567fc720308656ad46ce91c3ed1657",
  "operations.mdx":
    "7466bd6342882e90a3e941538b2241e01401ff508a80faf010836d85e10f1300",
  "quick-start.mdx":
    "138ef98512068720c72d444295cb7a2d1ac05ad75518959fc26fd4b00b44fa90",
  "upgrade.mdx":
    "c11e526688d741757e84b8cdff8ab24f392f84bdb1a081b2f67177d73b43361b",
} as const;

export type ConvertedLegacyMdx = {
  title: string;
  summary: string;
  source: string;
};

const allowedComponents = new Set(["Callout", "Cards", "FileTree", "Steps"]);

export function computeLegacyFixtureChecksum(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function parseLegacyMeta(source: string): Array<[string, string]> {
  const match = source.match(
    /^const meta = \{\n([\s\S]*?)\n\};\n\nexport default meta;\n?$/u,
  );
  if (!match) throw new Error("LEGACY_META_INVALID");

  const entries: Array<[string, string]> = [];
  for (const line of match[1].split("\n")) {
    const entry = line.match(
      /^  (?:(?:"([a-z0-9-]+)")|([a-z0-9-]+)): "([^"]+)",$/u,
    );
    if (!entry) throw new Error("LEGACY_META_INVALID");
    entries.push([entry[1] ?? entry[2], entry[3]]);
  }
  if (new Set(entries.map(([slug]) => slug)).size !== entries.length) {
    throw new Error("LEGACY_META_DUPLICATE_SLUG");
  }
  return entries;
}

export function convertLegacyMdx(source: string): ConvertedLegacyMdx {
  if (source.includes("\r")) throw new Error("LEGACY_MDX_INVALID_NEWLINE");
  const frontMatter = parseFrontMatter(source);
  const fences = protectFencedCode(frontMatter.body);
  const indentedCode = protectIndentedCode(fences.source);
  const withoutImports = removeAllowedImports(indentedCode.source);
  const withFileTrees = convertFileTrees(withoutImports);
  const protectedSource = convertComponents(withFileTrees).trim();

  const unknown = protectedSource.match(/<\/?([A-Z][A-Za-z0-9.]*)\b/u);
  if (unknown) {
    throw new Error(`LEGACY_MDX_UNSUPPORTED_COMPONENT:${unknown[1]}`);
  }
  const safeSource = fences.restore(indentedCode.restore(protectedSource));
  if (!safeSource) throw new Error("LEGACY_MDX_EMPTY");

  return {
    title: frontMatter.title,
    summary: frontMatter.description,
    source: `${safeSource}\n`,
  };
}

function protectIndentedCode(source: string): {
  source: string;
  restore: (value: string) => string;
} {
  const lines: string[] = [];
  let protectedSource = "";
  let insideFileTree = false;

  for (const rawLine of source.match(/[^\n]*(?:\n|$)/gu) ?? []) {
    if (!rawLine) continue;
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();

    if (!insideFileTree && /^(?: {4}|\t)/u.test(line)) {
      const code = line.replace(/^(?: {4}|\t)/u, "").trimStart();
      if (
        /^import(?:\s|\{|\(|["'])/u.test(code) ||
        /^<\/?[A-Z][A-Za-z0-9.]*\b/u.test(code)
      ) {
        throw new Error("LEGACY_MDX_AMBIGUOUS_INDENTED_CODE");
      }

      const hasTrailingNewline = rawLine.endsWith("\n");
      const placeholder = `\0LEGACY_INDENTED_${lines.length}\0`;
      lines.push(line);
      protectedSource += `${placeholder}${hasTrailingNewline ? "\n" : ""}`;
      continue;
    }

    if (trimmed === "<FileTree>") insideFileTree = true;
    if (trimmed === "</FileTree>") insideFileTree = false;
    protectedSource += rawLine;
  }

  return {
    source: protectedSource,
    restore(value) {
      let restored = value;
      for (const [index, line] of lines.entries()) {
        restored = restored.replaceAll(`\0LEGACY_INDENTED_${index}\0`, line);
      }
      return restored;
    },
  };
}

function protectFencedCode(source: string): {
  source: string;
  restore: (value: string) => string;
} {
  if (source.includes("\0")) throw new Error("LEGACY_MDX_INVALID_FENCE");
  const fences: string[] = [];
  let protectedSource = "";
  let active: { marker: "`" | "~"; length: number; source: string } | undefined;

  for (const rawLine of source.match(/[^\n]*(?:\n|$)/gu) ?? []) {
    if (!rawLine) continue;
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;
    if (!active) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
      if (!opening || (opening[1][0] === "`" && opening[2].includes("`"))) {
        protectedSource += rawLine;
        continue;
      }
      active = {
        marker: opening[1][0] as "`" | "~",
        length: opening[1].length,
        source: rawLine,
      };
      continue;
    }

    active.source += rawLine;
    const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/u);
    if (
      !closing ||
      closing[1][0] !== active.marker ||
      closing[1].length < active.length
    ) {
      continue;
    }

    const hasTrailingNewline = active.source.endsWith("\n");
    const exactFence = hasTrailingNewline
      ? active.source.slice(0, -1)
      : active.source;
    const placeholder = `\0LEGACY_FENCE_${fences.length}\0`;
    fences.push(exactFence);
    protectedSource += `${placeholder}${hasTrailingNewline ? "\n" : ""}`;
    active = undefined;
  }

  if (active) throw new Error("LEGACY_MDX_UNTERMINATED_FENCE");
  return {
    source: protectedSource,
    restore(value) {
      let restored = value;
      for (const [index, fence] of fences.entries()) {
        restored = restored.replaceAll(`\0LEGACY_FENCE_${index}\0`, fence);
      }
      return restored;
    },
  };
}

function parseFrontMatter(source: string): {
  title: string;
  description: string;
  body: string;
} {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  if (!match) throw new Error("LEGACY_MDX_INVALID_FRONT_MATTER");

  const values = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-z]+): (.+)$/u);
    if (!field || !["title", "description"].includes(field[1])) {
      throw new Error("LEGACY_MDX_INVALID_FRONT_MATTER");
    }
    if (values.has(field[1])) {
      throw new Error("LEGACY_MDX_INVALID_FRONT_MATTER");
    }
    values.set(field[1], field[2].trim());
  }

  const title = values.get("title");
  const description = values.get("description");
  if (!title || !description || values.size !== 2) {
    throw new Error("LEGACY_MDX_INVALID_FRONT_MATTER");
  }
  return { title, description, body: match[2] };
}

function removeAllowedImports(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      if (!/^import(?:\s|\{|\(|["'])/u.test(line.trimStart())) return true;
      const match = line.match(
        /^import \{ ([A-Za-z]+(?:, [A-Za-z]+)*) \} from "nextra\/components";$/u,
      );
      if (!match) throw new Error("LEGACY_MDX_UNSUPPORTED_IMPORT");
      const components = match[1].split(", ");
      if (
        new Set(components).size !== components.length ||
        components.some((component) => !allowedComponents.has(component))
      ) {
        throw new Error("LEGACY_MDX_UNSUPPORTED_IMPORT");
      }
      return false;
    })
    .join("\n");
}

function convertFileTrees(source: string): string {
  let result = "";
  let cursor = 0;
  const opening = "<FileTree>";
  const closing = "</FileTree>";

  while (true) {
    const start = source.indexOf(opening, cursor);
    if (start < 0) break;
    const end = source.indexOf(closing, start + opening.length);
    if (end < 0 || source.indexOf(opening, start + opening.length) >= 0) {
      throw new Error("LEGACY_MDX_INVALID_FILETREE");
    }
    const before = source.slice(cursor, start);
    const rawTree = source.slice(start + opening.length, end);
    result += `${before}\`\`\`filetree\n${parseFileTree(rawTree)}\n\`\`\``;
    cursor = end + closing.length;
  }
  result += source.slice(cursor);
  if (result.includes(opening) || result.includes(closing)) {
    throw new Error("LEGACY_MDX_INVALID_FILETREE");
  }
  return result;
}

function parseFileTree(source: string): string {
  const output: string[] = [];
  const folders: string[] = [];
  const lines = source.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const value = line.trim();
    const nestedFolder = value.match(
      /^<FileTree\.Folder name="([^"]+)"(?: open)?>$/u,
    );
    if (nestedFolder) {
      output.push(`${"  ".repeat(folders.length)}${nestedFolder[1]}/`);
      folders.push(nestedFolder[1]);
      continue;
    }
    const leafFolder = value.match(
      /^<FileTree\.Folder name="([^"]+)"(?: open)? \/>$/u,
    );
    if (leafFolder) {
      output.push(`${"  ".repeat(folders.length)}${leafFolder[1]}/`);
      continue;
    }
    const file = value.match(/^<FileTree\.File name="([^"]+)" \/>$/u);
    if (file) {
      output.push(`${"  ".repeat(folders.length)}${file[1]}`);
      continue;
    }
    if (value === "</FileTree.Folder>") {
      if (!folders.pop()) throw new Error("LEGACY_MDX_INVALID_FILETREE");
      continue;
    }
    throw new Error("LEGACY_MDX_INVALID_FILETREE");
  }

  if (folders.length > 0 || output.length === 0) {
    throw new Error("LEGACY_MDX_INVALID_FILETREE");
  }
  return output.join("\n");
}

function convertComponents(source: string): string {
  const output: string[] = [];
  const stack: Array<"Callout" | "Cards" | "Steps"> = [];

  for (const originalLine of source.split("\n")) {
    const line = originalLine.trim();
    const callout = line.match(/^<Callout type="([^"]+)">$/u);
    if (callout) {
      if (!isCalloutType(callout[1])) {
        throw new Error("LEGACY_MDX_INVALID_CALLOUT");
      }
      stack.push("Callout");
      output.push(`:::callout{type="${callout[1]}"}`);
      continue;
    }
    if (line === "<Steps>") {
      stack.push("Steps");
      output.push(":::steps");
      continue;
    }
    if (line === "<Cards>") {
      stack.push("Cards");
      output.push(":::cards");
      continue;
    }
    const close = line.match(/^<\/(Callout|Cards|Steps)>$/u);
    if (close) {
      if (stack.pop() !== close[1]) {
        throw new Error(`LEGACY_MDX_INVALID_${close[1].toUpperCase()}`);
      }
      output.push(":::");
      continue;
    }
    if (line.startsWith("<Cards.Card")) {
      if (stack.at(-1) !== "Cards") throw new Error("LEGACY_MDX_INVALID_CARD");
      output.push(convertCard(line));
      continue;
    }
    if (/<\/?(?:Callout|Cards(?:\.Card)?|Steps)\b/u.test(line)) {
      const component = line.includes("Callout")
        ? "CALLOUT"
        : line.includes("Cards.Card")
          ? "CARD"
          : line.includes("Cards")
            ? "CARDS"
            : "STEPS";
      throw new Error(`LEGACY_MDX_INVALID_${component}`);
    }

    output.push(
      stack.includes("Callout") && originalLine.startsWith("  ")
        ? originalLine.slice(2)
        : originalLine,
    );
  }

  if (stack.length > 0) {
    throw new Error(`LEGACY_MDX_INVALID_${stack.at(-1)?.toUpperCase()}`);
  }
  return output.join("\n");
}

function convertCard(line: string): string {
  const match = line.match(/^<Cards\.Card ([^<>]+) \/>$/u);
  if (!match) throw new Error("LEGACY_MDX_INVALID_CARD");

  const attributes = new Map<string, string | true>();
  const attributePattern = /([A-Za-z]+)(?:="([^"]*)")?(?: |$)/gu;
  let consumed = "";
  for (const attribute of match[1].matchAll(attributePattern)) {
    consumed += attribute[0];
    if (attributes.has(attribute[1]))
      throw new Error("LEGACY_MDX_INVALID_CARD");
    attributes.set(attribute[1], attribute[2] ?? true);
  }
  if (consumed !== match[1]) throw new Error("LEGACY_MDX_INVALID_CARD");
  if (
    [...attributes.keys()].some(
      (name) => !["title", "href", "arrow"].includes(name),
    ) ||
    typeof attributes.get("title") !== "string" ||
    typeof attributes.get("href") !== "string" ||
    (attributes.has("arrow") && attributes.get("arrow") !== true)
  ) {
    throw new Error("LEGACY_MDX_INVALID_CARD");
  }

  const title = attributes.get("title") as string;
  const href = attributes.get("href") as string;
  if (!title || /[\[\]]/u.test(title) || !href || /[\s()]/u.test(href)) {
    throw new Error("LEGACY_MDX_INVALID_CARD");
  }
  return `- [${title}](${href})`;
}
