import {
  isAssistantStreamDeltaEvent,
  isAssistantStreamDoneEvent,
  isAssistantStreamErrorEvent,
  isAssistantStreamStartEvent,
  type AssistantStreamDeltaEvent,
  type AssistantStreamDoneEvent,
  type AssistantStreamErrorEvent,
  type AssistantStreamStartEvent,
} from "./assistant-contract";

export const ASSISTANT_STREAM_MEDIA_TYPE = "text/event-stream";

export type AssistantStreamEvent =
  | { event: "start"; data: AssistantStreamStartEvent }
  | { event: "delta"; data: AssistantStreamDeltaEvent }
  | { event: "done"; data: AssistantStreamDoneEvent }
  | { event: "error"; data: AssistantStreamErrorEvent };

export function formatAssistantStreamEvent(
  event: AssistantStreamEvent,
): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function parseAssistantStreamFrame(
  rawFrame: string,
): AssistantStreamEvent | null {
  const lines = rawFrame.replaceAll("\r\n", "\n").split("\n");
  if (lines.length !== 2) return null;
  const [eventLine, dataLine] = lines;
  if (!eventLine?.startsWith("event: ") || !dataLine?.startsWith("data: ")) {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(dataLine.slice(6));
  } catch {
    return null;
  }

  const event = eventLine.slice(7);
  if (event === "start" && isAssistantStreamStartEvent(data)) {
    return { event, data };
  }
  if (event === "delta" && isAssistantStreamDeltaEvent(data)) {
    return { event, data };
  }
  if (event === "done" && isAssistantStreamDoneEvent(data)) {
    return { event, data };
  }
  if (event === "error" && isAssistantStreamErrorEvent(data)) {
    return { event, data };
  }
  return null;
}
