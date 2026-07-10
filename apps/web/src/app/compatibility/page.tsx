import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/compatibility");

export default function Page() {
  return <RegisteredRoutePage pathname="/compatibility" />;
}
