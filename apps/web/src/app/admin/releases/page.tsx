import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/releases");

export default async function Page() {
  await requirePermission("admin:releases");
  return <RegisteredRoutePage pathname="/admin/releases" />;
}
