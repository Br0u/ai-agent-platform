import { z } from "zod";

import {
  DEPLOYMENT_OPTIONS,
  MODULE_OPTIONS,
  SCALE_OPTIONS,
  TERM_OPTIONS,
} from "./pricing-config";

const deploymentIds = DEPLOYMENT_OPTIONS.map((option) => option.id);
const scaleIds = SCALE_OPTIONS.map((option) => option.id);
const moduleIds = MODULE_OPTIONS.map((option) => option.id);
const termIds = TERM_OPTIONS.map((option) => option.id);

export const pricingEstimateRequestSchema = z
  .object({
    deployment: z.enum(deploymentIds),
    scale: z.enum(scaleIds),
    modules: z
      .array(z.enum(moduleIds))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    term: z.enum(termIds),
  })
  .strict();

export type PricingEstimateRequest = z.infer<
  typeof pricingEstimateRequestSchema
>;

export type PricingEstimateNotAvailableResponse = {
  readonly status: "not_available";
  readonly message: "在线估算尚未开放，最终价格以商务报价为准。";
};

export type PricingEstimateErrorResponse = {
  readonly status: "error";
  readonly error: {
    readonly code: "invalid_configuration";
    readonly message: "价格配置无效。";
  };
};

export const PRICING_ESTIMATE_NOT_AVAILABLE_RESPONSE: PricingEstimateNotAvailableResponse =
  Object.freeze({
    status: "not_available",
    message: "在线估算尚未开放，最终价格以商务报价为准。",
  });

export const INVALID_PRICING_CONFIGURATION_RESPONSE: PricingEstimateErrorResponse =
  Object.freeze({
    status: "error",
    error: Object.freeze({
      code: "invalid_configuration",
      message: "价格配置无效。",
    }),
  });

export function parsePricingEstimateRequest(
  input: unknown,
): PricingEstimateRequest | null {
  const result = pricingEstimateRequestSchema.safeParse(input);
  return result.success ? result.data : null;
}
