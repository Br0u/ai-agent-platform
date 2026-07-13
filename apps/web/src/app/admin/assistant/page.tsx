import {
  loadPlaceholderAdminAssistantSessions,
  type AdminAssistantSessionsResponse,
} from "@/app/api/v1/admin/assistant/sessions/handler";
import {
  loadPlaceholderAdminAssistantStatus,
  type AdminAssistantStatusResponse,
} from "@/app/api/v1/admin/assistant/status/handler";
import { AssistantAdminPage } from "@/components/admin/assistant-admin-page";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

const pathname = "/admin/assistant";

export const metadata = metadataForRegisteredRoute(pathname);

export default async function AdminAssistantPage() {
  await requirePermission("admin:assistant");
  const [status, sessions]: [
    AdminAssistantStatusResponse,
    AdminAssistantSessionsResponse,
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
