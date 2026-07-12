import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/blog");

export default async function Page() {
  await requirePermission("admin:blog");
  return <RegisteredRoutePage pathname="/admin/blog" />;
}
