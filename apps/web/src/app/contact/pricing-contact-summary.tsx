import {
  DEPLOYMENT_OPTIONS,
  MODULE_OPTIONS,
  SCALE_OPTIONS,
  TERM_OPTIONS,
} from "@/features/pricing/pricing-config";
import type { PricingContactSelection } from "@/features/pricing/pricing-query";

function labelFor<T extends { id: string; label: string }>(
  options: readonly T[],
  id: string,
) {
  return options.find((option) => option.id === id)?.label;
}

function buildContactRows(selection: PricingContactSelection): string[] {
  const rows: string[] = [];
  const deployment = selection.deployment
    ? labelFor(DEPLOYMENT_OPTIONS, selection.deployment)
    : undefined;
  const scale = selection.scale
    ? labelFor(SCALE_OPTIONS, selection.scale)
    : undefined;
  const modules = selection.modules
    ?.map((id) => labelFor(MODULE_OPTIONS, id))
    .filter((label): label is string => label !== undefined);
  const term = selection.term
    ? labelFor(TERM_OPTIONS, selection.term)
    : undefined;

  if (deployment) rows.push(`部署方式：${deployment}`);
  if (scale) rows.push(`使用规模：${scale}`);
  if (modules && modules.length > 0) {
    rows.push(`功能模块：${modules.join("、")}`);
  }
  if (term) rows.push(`服务周期：${term}`);
  return rows;
}

export function PricingContactSummary({
  selection,
}: {
  selection: PricingContactSelection;
}) {
  const rows = buildContactRows(selection);

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
