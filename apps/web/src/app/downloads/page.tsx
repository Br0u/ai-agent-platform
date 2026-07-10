import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/downloads");

export default function Page() {
  return <RegisteredRoutePage pathname="/downloads" />;
}
