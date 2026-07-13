import { loadPlaceholderAdminAssistantSessions } from "@/app/api/v1/admin/assistant/sessions/handler";
import { loadPlaceholderAdminAssistantStatus } from "@/app/api/v1/admin/assistant/status/handler";
import { AssistantAdminPage } from "@/components/admin/assistant-admin-page";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import { requirePermission } from "@/server/auth/access";

const pathname = "/admin/assistant";

export const metadata = metadataForRegisteredRoute(pathname);

export default async function AdminAssistantPage() {
  await requirePermission("admin:assistant");
  const [status, sessions]: [
    AdminAssistantStatusSnapshot,
    AdminAssistantSessionsSnapshot,
  ] = await Promise.all([
    loadPlaceholderAdminAssistantStatus(),
    loadPlaceholderAdminAssistantSessions(),
  ]);

  return (
    <main>
      <AssistantAdminPage sessions={sessions} status={status} />
    </main>
  );
}
