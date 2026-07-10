import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/cases");

export default function Page() {
  return <RegisteredRoutePage pathname="/cases" />;
}
