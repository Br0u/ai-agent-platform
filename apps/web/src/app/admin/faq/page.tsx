import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin/faq");

export default async function Page() {
  await requirePermission("admin:faq");
  return <RegisteredRoutePage pathname="/admin/faq" />;
}
