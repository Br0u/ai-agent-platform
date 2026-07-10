import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/licenses");

export default function AdminLicensesPage() {
  return <RegisteredRoutePage pathname="/admin/licenses" />;
}
