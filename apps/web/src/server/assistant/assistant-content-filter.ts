const MAX_REASONING_NESTING = 64;
const REASONING_TAGS = ["think", "analysis"] as const;
type ReasoningTag = (typeof REASONING_TAGS)[number];
const TAG_CANDIDATES = REASONING_TAGS.flatMap((name) => [
  { prefix: `<${name}`, name, closing: false },
  { prefix: `</${name}`, name, closing: true },
]);

export class AssistantContentFilter {
  private buffer = "";
  private readonly hiddenTags: ReasoningTag[] = [];
  private failedClosed = false;

  push(chunk: string): string {
    if (this.failedClosed) return "";
    this.buffer += chunk;
    let output = "";

    while (this.buffer) {
      const start = this.buffer.indexOf("<");
      if (start === -1) {
        if (this.hiddenTags.length === 0) output += this.buffer;
        this.buffer = "";
        break;
      }
      if (start > 0) {
        if (this.hiddenTags.length === 0) {
          output += this.buffer.slice(0, start);
        }
        this.buffer = this.buffer.slice(start);
      }

      const lower = this.buffer.toLowerCase();
      const candidate = TAG_CANDIDATES.find(({ prefix }) =>
        lower.startsWith(prefix),
      );
      if (!candidate) {
        if (TAG_CANDIDATES.some(({ prefix }) => prefix.startsWith(lower)))
          break;
        if (this.hiddenTags.length === 0) output += "<";
        this.buffer = this.buffer.slice(1);
        continue;
      }
      if (this.buffer.length === candidate.prefix.length) break;
      const boundary = this.buffer[candidate.prefix.length];
      if (boundary !== ">" && boundary !== "/" && !/\s/u.test(boundary!)) {
        if (this.hiddenTags.length === 0) output += "<";
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const end = this.tagEnd();
      if (end === -1) break;
      const tag = this.buffer.slice(0, end + 1);
      this.buffer = this.buffer.slice(end + 1);
      if (candidate.closing) {
        if (this.hiddenTags.length === 0) {
          output += tag;
        } else if (this.hiddenTags.at(-1) === candidate.name) {
          this.hiddenTags.pop();
        }
      } else if (!/\/\s*>$/u.test(tag)) {
        if (this.hiddenTags.length === MAX_REASONING_NESTING) {
          this.failedClosed = true;
          this.buffer = "";
          return output;
        }
        this.hiddenTags.push(candidate.name);
      }
    }

    return output;
  }

  finish(): string {
    const output =
      !this.failedClosed &&
      this.hiddenTags.length === 0 &&
      !this.hasPendingRecognizedTag()
        ? this.buffer
        : "";
    this.buffer = "";
    this.hiddenTags.length = 0;
    this.failedClosed = false;
    return output;
  }

  private hasPendingRecognizedTag(): boolean {
    const lower = this.buffer.toLowerCase();
    return TAG_CANDIDATES.some(({ prefix }) => {
      if (!lower.startsWith(prefix)) return false;
      const boundary = this.buffer[prefix.length];
      return (
        boundary === undefined ||
        boundary === ">" ||
        boundary === "/" ||
        /\s/u.test(boundary)
      );
    });
  }

  private tagEnd(): number {
    let quote: '"' | "'" | null = null;
    for (let index = 1; index < this.buffer.length; index += 1) {
      const character = this.buffer[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        return index;
      }
    }
    return -1;
  }
}
