import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/faq");

export default function Page() {
  return <RegisteredRoutePage pathname="/admin/faq" />;
}
