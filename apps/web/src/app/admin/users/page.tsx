import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/users");

export default function Page() {
  return <RegisteredRoutePage pathname="/admin/users" />;
}
