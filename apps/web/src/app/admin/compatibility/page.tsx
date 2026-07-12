import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/compatibility");

export default async function Page() {
  await requirePermission("admin:compatibility");
  return <RegisteredRoutePage pathname="/admin/compatibility" />;
}
