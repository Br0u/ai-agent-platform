import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/support");

export default function Page() {
  return <RegisteredRoutePage pathname="/support" />;
}
