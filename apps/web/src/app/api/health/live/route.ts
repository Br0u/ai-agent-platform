import { getLiveness } from "@ai-agent-platform/database";

export function GET(): Response {
  return Response.json(getLiveness(), { status: 200 });
}
