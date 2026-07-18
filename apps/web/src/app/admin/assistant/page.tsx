import { loadAdminAssistantSessions } from "@/app/api/v1/admin/assistant/sessions/handler";
import { loadAdminAssistantStatus } from "@/app/api/v1/admin/assistant/status/handler";
import { loadAdminModelConfigSnapshot } from "@/app/api/v1/admin/assistant/model-configs/handler";
import { AssistantAdminPage } from "@/components/admin/assistant-admin-page";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import type { AdminModelConfigSnapshot } from "@/features/assistant/admin-model-config-contract";
import { requirePermission } from "@/server/auth/access";

const pathname = "/admin/assistant";

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
    loadAdminModelConfigSnapshot(actor),
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
