import {
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  hasAtMostCodePoints,
} from "@/features/assistant/assistant-contract";

export class AssistantContentFilter {
  private buffer = "";

  push(chunk: string): string {
    this.buffer += chunk;
    return "";
  }

  finish(): string {
    try {
      const parsed: unknown = JSON.parse(this.buffer);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 ||
        !("answer" in parsed) ||
        typeof parsed.answer !== "string" ||
        parsed.answer.trim().length === 0 ||
        !hasAtMostCodePoints(parsed.answer, ASSISTANT_CONTENT_MAX_CODE_POINTS)
      ) {
        return "";
      }
      return parsed.answer;
    } catch {
      return "";
    } finally {
      this.buffer = "";
    }
  }
}
