import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/navigation");

export default async function Page() {
  await requirePermission("admin:navigation");
  return <RegisteredRoutePage pathname="/admin/navigation" />;
}
