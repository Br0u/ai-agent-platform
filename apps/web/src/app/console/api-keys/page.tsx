import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/console/api-keys");

export default function Page() {
  return <RegisteredRoutePage pathname="/console/api-keys" />;
}
