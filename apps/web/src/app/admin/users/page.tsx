import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/users");

export default async function Page() {
  await requirePermission("admin:users");
  return <RegisteredRoutePage pathname="/admin/users" />;
}
