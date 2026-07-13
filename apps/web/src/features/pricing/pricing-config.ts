export const DEPLOYMENT_OPTIONS = [
  { id: "local-private", label: "本地私有化" },
  { id: "dedicated-cloud", label: "专有云" },
  { id: "tbd", label: "待商务确认" },
] as const;

export const SCALE_OPTIONS = [
  { id: "pilot", label: "体验验证" },
  { id: "department", label: "部门级" },
  { id: "enterprise", label: "企业级" },
] as const;

export const MODULE_OPTIONS = [
  { id: "agent-studio", label: "AI Agent Studio" },
  { id: "knowledge-base", label: "Knowledge Base" },
  { id: "workflow", label: "Workflow" },
  { id: "model-gateway", label: "Model Gateway" },
  { id: "agent-runtime", label: "Agent Runtime" },
  { id: "observability", label: "Observability" },
] as const;

export const TERM_OPTIONS = [
  { id: "1y", label: "一年" },
  { id: "3y", label: "三年" },
  { id: "tbd", label: "待商务确认" },
] as const;

export type DeploymentId = (typeof DEPLOYMENT_OPTIONS)[number]["id"];
export type ScaleId = (typeof SCALE_OPTIONS)[number]["id"];
export type PricingModuleId = (typeof MODULE_OPTIONS)[number]["id"];
export type TermId = (typeof TERM_OPTIONS)[number]["id"];

export type PricingSelection = {
  deployment: DeploymentId;
  scale: ScaleId;
  modules: readonly PricingModuleId[];
  term: TermId;
};

export const DEFAULT_PRICING_SELECTION: PricingSelection = {
  deployment: "local-private",
  scale: "pilot",
  modules: [],
  term: "tbd",
};
