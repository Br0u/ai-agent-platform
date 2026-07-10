import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/compatibility");

export default function Page() {
  return <RegisteredRoutePage pathname="/admin/compatibility" />;
}
