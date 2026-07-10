import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/roadmap");

export default function Page() {
  return <RegisteredRoutePage pathname="/roadmap" />;
}
