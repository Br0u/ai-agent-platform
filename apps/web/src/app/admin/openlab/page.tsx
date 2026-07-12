import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/openlab");

export default async function AdminOpenLabPage() {
  await requirePermission("admin:registrations");
  return <RegisteredRoutePage pathname="/admin/openlab" />;
}
