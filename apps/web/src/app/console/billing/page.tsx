import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/console/billing");

export default function Page() {
  return <RegisteredRoutePage pathname="/console/billing" />;
}
