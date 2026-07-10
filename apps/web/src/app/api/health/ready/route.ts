import {
  type DatabaseProbe,
  getReadiness,
  probeDatabase,
} from "@ai-agent-platform/database";

export function createReadinessHandler(probe: DatabaseProbe) {
  return async function GET(): Promise<Response> {
    const result = await getReadiness(probe);
    const status = result.status === "ready" ? 200 : 503;

    return Response.json(result, { status });
  };
}

export const GET = createReadinessHandler(probeDatabase);
