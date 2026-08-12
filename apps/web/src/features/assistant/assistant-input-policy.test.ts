import { describe, expect, it } from "vitest";

import {
  ASSISTANT_INPUT_POLICY_MAX_NORMALIZED_BYTES,
  ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES,
  ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS,
  ASSISTANT_INPUT_POLICY_MAX_TERMS,
  matchesAssistantInputPolicy,
  normalizeAssistantInputTerms,
} from "./assistant-input-policy";

describe("assistant input policy normalization", () => {
  it("normalizes full-width English, deduplicates stably, and counts blanks", () => {
    expect(normalizeAssistantInputTerms(" ＦＯＯ \r\nfoo\n\n中文\n")).toEqual({
      terms: ["foo", "中文"],
      duplicateCount: 1,
      blankCount: 2,
    });
  });

  it("counts terminal newlines as blank lines", () => {
    expect(normalizeAssistantInputTerms("term\n").blankCount).toBe(1);
    expect(normalizeAssistantInputTerms("term\n\n").blankCount).toBe(2);
  });

  it("matches normalized continuous substrings in current and historic user inputs", () => {
    expect(
      matchesAssistantInputPolicy(["这是中文内容", "nothing here"], ["中文"]),
    ).toBe(true);
    expect(matchesAssistantInputPolicy(["ＦＯＯbar"], ["foo"])).toBe(true);
    expect(matchesAssistantInputPolicy(["AlphaBeta"], ["beta"])).toBe(true);
    expect(matchesAssistantInputPolicy(["alpha beta"], ["alphabeta"])).toBe(
      false,
    );
  });

  it("rejects source input beyond the byte limit before normalization", () => {
    expect(
      normalizeAssistantInputTerms(
        " ".repeat(ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES),
      ),
    ).toEqual({ terms: [], duplicateCount: 0, blankCount: 1 });
    expect(() =>
      normalizeAssistantInputTerms(
        " ".repeat(ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES + 1),
      ),
    ).toThrow();
  });

  it("rejects more than the maximum number of normalized terms", () => {
    const maximumTerms = Array.from(
      { length: ASSISTANT_INPUT_POLICY_MAX_TERMS },
      (_, index) => `term-${index}`,
    ).join("\n");
    expect(normalizeAssistantInputTerms(maximumTerms).terms).toHaveLength(
      ASSISTANT_INPUT_POLICY_MAX_TERMS,
    );
    expect(() =>
      normalizeAssistantInputTerms(
        Array.from(
          { length: ASSISTANT_INPUT_POLICY_MAX_TERMS + 1 },
          (_, index) => `term-${index}`,
        ).join("\n"),
      ),
    ).toThrow();
  });

  it("rejects a normalized term beyond the code-point limit", () => {
    expect(
      normalizeAssistantInputTerms(
        "😀".repeat(ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS),
      ).terms,
    ).toHaveLength(1);
    expect(() =>
      normalizeAssistantInputTerms(
        "😀".repeat(ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS + 1),
      ),
    ).toThrow();
  });

  it("rejects normalized terms beyond the aggregate UTF-8 byte limit", () => {
    const terms = (termLength: number) =>
      Array.from(
        { length: ASSISTANT_INPUT_POLICY_MAX_TERMS },
        (_, index) =>
          `${"a".repeat(termLength - 4)}${index.toString().padStart(4, "0")}`,
      ).join("\n");
    expect(
      normalizeAssistantInputTerms(
        terms(
          ASSISTANT_INPUT_POLICY_MAX_NORMALIZED_BYTES /
            ASSISTANT_INPUT_POLICY_MAX_TERMS,
        ),
      ).terms,
    ).toHaveLength(ASSISTANT_INPUT_POLICY_MAX_TERMS);
    expect(() =>
      normalizeAssistantInputTerms(
        terms(
          ASSISTANT_INPUT_POLICY_MAX_NORMALIZED_BYTES /
            ASSISTANT_INPUT_POLICY_MAX_TERMS +
            1,
        ),
      ),
    ).toThrow();
  });
});
