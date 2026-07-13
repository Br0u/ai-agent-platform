import {
  DEFAULT_PRICING_SELECTION,
  DEPLOYMENT_OPTIONS,
  MODULE_OPTIONS,
  SCALE_OPTIONS,
  TERM_OPTIONS,
  type DeploymentId,
  type PricingModuleId,
  type PricingSelection,
  type ScaleId,
  type TermId,
} from "./pricing-config";

export type PricingSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

function firstValue(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function knownId<T extends string>(
  value: string | undefined,
  ids: ReadonlySet<string>,
): value is T {
  return value !== undefined && ids.has(value);
}

const deploymentIds = new Set<string>(
  DEPLOYMENT_OPTIONS.map((option) => option.id),
);
const scaleIds = new Set<string>(SCALE_OPTIONS.map((option) => option.id));
const moduleIds = new Set<string>(MODULE_OPTIONS.map((option) => option.id));
const termIds = new Set<string>(TERM_OPTIONS.map((option) => option.id));

function normalizeModules(values: readonly string[]): PricingModuleId[] {
  const requested = new Set(
    values
      .flatMap((value) => value.split(","))
      .filter((id) => moduleIds.has(id)),
  );

  return MODULE_OPTIONS.filter((option) => requested.has(option.id)).map(
    (option) => option.id,
  );
}

function normalizeSelection(selection: PricingSelection): PricingSelection {
  return {
    deployment: knownId<DeploymentId>(selection.deployment, deploymentIds)
      ? selection.deployment
      : DEFAULT_PRICING_SELECTION.deployment,
    scale: knownId<ScaleId>(selection.scale, scaleIds)
      ? selection.scale
      : DEFAULT_PRICING_SELECTION.scale,
    modules: normalizeModules(selection.modules),
    term: knownId<TermId>(selection.term, termIds)
      ? selection.term
      : DEFAULT_PRICING_SELECTION.term,
  };
}

export function buildPricingContactHref(selection: PricingSelection): string {
  const normalized = normalizeSelection(selection);
  const query = new URLSearchParams({
    source: "pricing",
    deployment: normalized.deployment,
    scale: normalized.scale,
    modules: normalized.modules.join(","),
    term: normalized.term,
  });

  return `/contact?${query.toString()}`;
}

export function parsePricingContactQuery(
  searchParams: PricingSearchParams,
): PricingSelection | null {
  if (firstValue(searchParams.source) !== "pricing") {
    return null;
  }

  const deployment = firstValue(searchParams.deployment);
  const scale = firstValue(searchParams.scale);
  const term = firstValue(searchParams.term);
  const modules = searchParams.modules;

  return {
    deployment: knownId<DeploymentId>(deployment, deploymentIds)
      ? deployment
      : DEFAULT_PRICING_SELECTION.deployment,
    scale: knownId<ScaleId>(scale, scaleIds)
      ? scale
      : DEFAULT_PRICING_SELECTION.scale,
    modules: normalizeModules(
      modules === undefined ? [] : Array.isArray(modules) ? modules : [modules],
    ),
    term: knownId<TermId>(term, termIds)
      ? term
      : DEFAULT_PRICING_SELECTION.term,
  };
}
