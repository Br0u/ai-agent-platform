import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/admin");

export default async function Page() {
  await requirePermission("admin:analytics");
  return <RegisteredRoutePage pathname="/admin" />;
}
