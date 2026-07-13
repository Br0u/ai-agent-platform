import type { PricingSelection } from "@/features/pricing/pricing-config";
import { buildPricingSummary } from "@/features/pricing/pricing-summary";

export function PricingContactSummary({
  selection,
}: {
  selection: PricingSelection;
}) {
  const rows = buildPricingSummary(selection);

  return (
    <section aria-labelledby="pricing-contact-summary-title">
      <h2 id="pricing-contact-summary-title">价格计算需求摘要</h2>
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <p>此摘要仅用于需求沟通，不是正式报价。</p>
    </section>
  );
}
