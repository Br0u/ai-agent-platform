import {
  INVALID_PRICING_CONFIGURATION_RESPONSE,
  PRICING_ESTIMATE_NOT_AVAILABLE_RESPONSE,
  parsePricingEstimateRequest,
} from "@/features/pricing/pricing-contract";

export function createPricingEstimateHandler() {
  return async function POST(request: Request): Promise<Response> {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return Response.json(INVALID_PRICING_CONFIGURATION_RESPONSE, {
        status: 400,
      });
    }

    if (!parsePricingEstimateRequest(input)) {
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
