import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/tickets");

export default async function AdminTicketsPage() {
  await requirePermission("admin:registrations");
  return <RegisteredRoutePage pathname="/admin/tickets" />;
}
