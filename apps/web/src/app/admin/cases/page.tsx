import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/cases");

export default function Page() {
  return <RegisteredRoutePage pathname="/admin/cases" />;
}
