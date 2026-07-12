import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/licenses");

export default async function AdminLicensesPage() {
  await requirePermission("admin:registrations");
  return <RegisteredRoutePage pathname="/admin/licenses" />;
}
