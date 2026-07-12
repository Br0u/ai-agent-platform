import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/roles");

export default async function Page() {
  await requirePermission("admin:roles");
  return <RegisteredRoutePage pathname="/admin/roles" />;
}
