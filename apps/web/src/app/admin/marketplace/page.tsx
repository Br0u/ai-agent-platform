import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/marketplace");

export default async function Page() {
  await requirePermission("admin:marketplace");
  return <RegisteredRoutePage pathname="/admin/marketplace" />;
}
