export interface AssistantRequestLog {
  requestId: string;
  statusCode: number;
  durationMs: number;
}

export interface AssistantRequestLogger {
  log(record: AssistantRequestLog): void;
}

export const assistantRequestLogger: AssistantRequestLogger = {
  log(record) {
    console.info(JSON.stringify(record));
  },
};
