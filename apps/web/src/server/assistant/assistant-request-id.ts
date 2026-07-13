import { isAssistantRequestId } from "@/features/assistant/assistant-contract";

export const ASSISTANT_REQUEST_ID_HEADER_MAX_LENGTH = 64;

const SAFE_REQUEST_ID = new RegExp(
  `^[A-Za-z0-9._:-]{1,${ASSISTANT_REQUEST_ID_HEADER_MAX_LENGTH}}$`,
  "u",
);

export function resolveAssistantRequestId(
  request: Request,
  factory: () => string,
): string {
  const header = request.headers.get("x-request-id");
  if (header !== null && SAFE_REQUEST_ID.test(header)) return header;

  const generated = factory();
  return isAssistantRequestId(generated) ? generated : crypto.randomUUID();
}
