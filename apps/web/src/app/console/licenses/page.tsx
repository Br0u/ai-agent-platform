import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/console/licenses");

export default function Page() {
  return <RegisteredRoutePage pathname="/console/licenses" />;
}
