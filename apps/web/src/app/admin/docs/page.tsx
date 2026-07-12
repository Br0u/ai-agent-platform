import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/docs");

export default async function AdminDocsPage() {
  await requirePermission("admin:docs");
  return <RegisteredRoutePage pathname="/admin/docs" />;
}
