import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/docs");

export default function AdminDocsPage() {
  return <RegisteredRoutePage pathname="/admin/docs" />;
}
