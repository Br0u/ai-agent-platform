import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { requireCustomer } from "@/server/auth/access";

export const metadata = metadataForRegisteredRoute("/console/licenses");

export default async function Page() {
  await requireCustomer();
  return <RegisteredRoutePage pathname="/console/licenses" />;
}
