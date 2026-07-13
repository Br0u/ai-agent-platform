import {
  INVALID_PRICING_CONFIGURATION_RESPONSE,
  PRICING_ESTIMATE_NOT_AVAILABLE_RESPONSE,
  parsePricingEstimateRequest,
} from "@/features/pricing/pricing-contract";
import { readBoundedJson } from "@/server/http/read-bounded-json";

const MAX_REQUEST_BODY_BYTES = 4096;

export function createPricingEstimateHandler() {
  return async function POST(request: Request): Promise<Response> {
    const input = await readBoundedJson(request, MAX_REQUEST_BODY_BYTES);
    if (!input.ok) {
      return Response.json(INVALID_PRICING_CONFIGURATION_RESPONSE, {
        status: 400,
      });
    }

    if (!parsePricingEstimateRequest(input.value)) {
      return Response.json(INVALID_PRICING_CONFIGURATION_RESPONSE, {
        status: 400,
      });
    }

    return Response.json(PRICING_ESTIMATE_NOT_AVAILABLE_RESPONSE, {
      status: 501,
    });
  };
}

export const pricingEstimateHandler = createPricingEstimateHandler();
