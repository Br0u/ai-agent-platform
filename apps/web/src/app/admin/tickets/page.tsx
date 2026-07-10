import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/tickets");

export default function AdminTicketsPage() {
  return <RegisteredRoutePage pathname="/admin/tickets" />;
}
