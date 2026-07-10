import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/console/team");

export default function Page() {
  return <RegisteredRoutePage pathname="/console/team" />;
}
