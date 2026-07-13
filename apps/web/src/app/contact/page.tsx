import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import {
  parsePricingContactQuery,
  type PricingSearchParams,
} from "@/features/pricing/pricing-query";
import { PricingContactSummary } from "./pricing-contact-summary";

export const metadata = metadataForRegisteredRoute("/contact");

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<PricingSearchParams>;
}) {
  const selection = parsePricingContactQuery(await searchParams);

  return (
    <RegisteredRoutePage pathname="/contact">
      {selection ? <PricingContactSummary selection={selection} /> : null}
    </RegisteredRoutePage>
  );
}
