import {
  isAssistantStreamEventData,
  type AssistantStreamEventData,
} from "./assistant-contract";

export const ASSISTANT_STREAM_MEDIA_TYPE = "text/event-stream";

export type AssistantStreamEvent = AssistantStreamEventData;

export function formatAssistantStreamEvent(
  event: AssistantStreamEvent,
): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseAssistantStreamFrame(
  rawFrame: string,
): AssistantStreamEvent | null {
  const lines = rawFrame.replaceAll("\r\n", "\n").split("\n");
  if (lines.length !== 1 || !lines[0]?.startsWith("data: ")) return null;

  try {
    const data: unknown = JSON.parse(lines[0].slice(6));
    return isAssistantStreamEventData(data) ? data : null;
  } catch {
    return null;
  }
}
