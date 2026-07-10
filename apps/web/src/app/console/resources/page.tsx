import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/console/resources");

export default function Page() {
  return <RegisteredRoutePage pathname="/console/resources" />;
}
