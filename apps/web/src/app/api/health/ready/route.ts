import { probeDatabase } from "@ai-agent-platform/database";

import { createReadinessHandler } from "./handler";

export const GET = createReadinessHandler(probeDatabase);
