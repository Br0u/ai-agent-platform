import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/audit-logs");

export default async function Page() {
  await requirePermission("admin:audit");
  return <RegisteredRoutePage pathname="/admin/audit-logs" />;
}
