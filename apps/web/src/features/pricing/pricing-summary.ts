import {
  DEPLOYMENT_OPTIONS,
  MODULE_OPTIONS,
  SCALE_OPTIONS,
  TERM_OPTIONS,
  type PricingSelection,
} from "./pricing-config";

function labelFor<T extends { id: string; label: string }>(
  options: readonly T[],
  id: string,
) {
  return options.find((option) => option.id === id)?.label ?? "待商务确认";
}

export function buildPricingSummary(selection: PricingSelection): string[] {
  const selectedModules = new Set(selection.modules);
  const moduleLabels = MODULE_OPTIONS.filter((option) =>
    selectedModules.has(option.id),
  ).map((option) => option.label);

  return [
    `部署方式：${labelFor(DEPLOYMENT_OPTIONS, selection.deployment)}`,
    `使用规模：${labelFor(SCALE_OPTIONS, selection.scale)}`,
    `功能模块：${moduleLabels.length > 0 ? moduleLabels.join("、") : "暂未选择"}`,
    `服务周期：${labelFor(TERM_OPTIONS, selection.term)}`,
  ];
}
