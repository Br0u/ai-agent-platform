import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/openlab");

export default function AdminOpenLabPage() {
  return <RegisteredRoutePage pathname="/admin/openlab" />;
}
