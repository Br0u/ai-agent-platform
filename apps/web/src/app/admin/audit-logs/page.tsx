import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/audit-logs");

export default function Page() {
  return <RegisteredRoutePage pathname="/admin/audit-logs" />;
}
