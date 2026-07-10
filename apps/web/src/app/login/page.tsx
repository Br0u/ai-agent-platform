import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/login");

export default function Page() {
  return <RegisteredRoutePage pathname="/login" />;
}
