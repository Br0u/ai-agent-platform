import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/cases");

export default async function Page() {
  await requirePermission("admin:cases");
  return <RegisteredRoutePage pathname="/admin/cases" />;
}
