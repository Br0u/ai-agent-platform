import { loadAdminAssistantSessions } from "@/app/api/v1/admin/assistant/sessions/handler";
import { loadAdminAssistantStatus } from "@/app/api/v1/admin/assistant/status/handler";
import { loadAdminModelConfigSnapshot } from "@/app/api/v1/admin/assistant/model-configs/handler";
import { AssistantAdminPage } from "@/components/admin/assistant-admin-page";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import {
  ADMIN_MODEL_PROVIDERS,
  type AdminModelConfigSnapshot,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import { requirePermission } from "@/server/auth/access";

const pathname = "/admin/assistant";
const modelProviderNames: Readonly<Record<AdminModelProvider, string>> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  dashscope: "Qwen / DashScope",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
};

function unavailableModelConfigSnapshot(
  permissions: readonly string[],
): AdminModelConfigSnapshot {
  return {
    version: "1",
    configs: ADMIN_MODEL_PROVIDERS.map((provider) => ({
      provider,
      displayName: modelProviderNames[provider],
      modelId: null,
      endpointId: null,
      revision: null,
      testStatus: "not_configured",
      lastTestedAt: null,
      apiKey: null,
      activeRevision: null,
    })),
    endpoints: {
      openai: [],
      anthropic: [],
      google: [],
      dashscope: [],
      deepseek: [],
      minimax: [],
    },
    runtime: {
      capability: "degraded",
      source: null,
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
    },
    canConfigure: permissions.includes("admin:assistant:configure"),
    canReveal: permissions.includes("admin:assistant:secret:reveal"),
    controlEnabled: false,
  };
}

export const metadata = metadataForRegisteredRoute(pathname);

export default async function AdminAssistantPage() {
  const actor = await requirePermission("admin:assistant");
  const [status, sessions, modelConfigs]: [
    AdminAssistantStatusSnapshot,
    AdminAssistantSessionsSnapshot,
    AdminModelConfigSnapshot,
  ] = await Promise.all([
    loadAdminAssistantStatus(),
    loadAdminAssistantSessions(),
    loadAdminModelConfigSnapshot(actor).catch(() =>
      unavailableModelConfigSnapshot(actor.permissions),
    ),
  ]);

  return (
    <main>
      <AssistantAdminPage
        modelConfigs={modelConfigs}
        sessions={sessions}
        status={status}
      />
    </main>
  );
}
