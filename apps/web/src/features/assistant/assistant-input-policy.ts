export const ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES = 32 * 1024;
export const ASSISTANT_INPUT_POLICY_MAX_TERMS = 500;
export const ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS = 80;
export const ASSISTANT_INPUT_POLICY_MAX_NORMALIZED_BYTES = 24 * 1024;

export class AssistantInputPolicyValidationError extends Error {
  constructor(
    readonly code:
      | "ASSISTANT_INPUT_POLICY_SOURCE_TOO_LARGE"
      | "ASSISTANT_INPUT_POLICY_TOO_MANY_TERMS"
      | "ASSISTANT_INPUT_POLICY_TERM_TOO_LARGE"
      | "ASSISTANT_INPUT_POLICY_NORMALIZED_TOO_LARGE",
  ) {
    super("Assistant input policy is invalid");
  }
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function normalizeAssistantInputTerms(source: string): {
  terms: string[];
  duplicateCount: number;
  blankCount: number;
} {
  if (byteLength(source) > ASSISTANT_INPUT_POLICY_MAX_SOURCE_BYTES) {
    throw new AssistantInputPolicyValidationError(
      "ASSISTANT_INPUT_POLICY_SOURCE_TOO_LARGE",
    );
  }

  const terms: string[] = [];
  const seen = new Set<string>();
  let blankCount = 0;
  let duplicateCount = 0;

  for (const line of source.split(/\r\n|\n/u)) {
    const term = normalized(line).trim();
    if (!term) {
      blankCount += 1;
      continue;
    }
    if (seen.has(term)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(term);
    terms.push(term);
  }

  if (terms.length > ASSISTANT_INPUT_POLICY_MAX_TERMS) {
    throw new AssistantInputPolicyValidationError(
      "ASSISTANT_INPUT_POLICY_TOO_MANY_TERMS",
    );
  }
  if (
    terms.some(
      (term) =>
        Array.from(term).length > ASSISTANT_INPUT_POLICY_MAX_TERM_CODE_POINTS,
    )
  ) {
    throw new AssistantInputPolicyValidationError(
      "ASSISTANT_INPUT_POLICY_TERM_TOO_LARGE",
    );
  }
  if (
    terms.reduce((total, term) => total + byteLength(term), 0) >
    ASSISTANT_INPUT_POLICY_MAX_NORMALIZED_BYTES
  ) {
    throw new AssistantInputPolicyValidationError(
      "ASSISTANT_INPUT_POLICY_NORMALIZED_TOO_LARGE",
    );
  }

  return { terms, duplicateCount, blankCount };
}

export function matchesAssistantInputPolicy(
  userInputs: readonly string[],
  terms: readonly string[],
): boolean {
  const normalizedTerms = terms.map(normalized).filter(Boolean);
  return userInputs.some((input) => {
    const normalizedInput = normalized(input);
    return normalizedTerms.some((term) => normalizedInput.includes(term));
  });
}
