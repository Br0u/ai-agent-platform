import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requireConsolePage } from "@/server/auth/workspace-route-guards";

export const metadata = metadataForRegisteredRoute("/console/resources");

export default async function Page() {
  await requireConsolePage();
  return <RegisteredRoutePage pathname="/console/resources" />;
}
