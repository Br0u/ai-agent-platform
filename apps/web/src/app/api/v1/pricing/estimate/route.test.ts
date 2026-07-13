import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  INVALID_PRICING_CONFIGURATION_RESPONSE,
  PRICING_ESTIMATE_NOT_AVAILABLE_RESPONSE,
  parsePricingEstimateRequest,
} from "@/features/pricing/pricing-contract";
import { createPricingEstimateHandler } from "./handler";
import * as route from "./route";

const legalRequest = {
  deployment: "local-private",
  scale: "pilot",
  modules: ["agent-studio", "workflow"],
  term: "1y",
};

function request(body: string) {
  return new Request("http://localhost/api/v1/pricing/estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function streamingRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Request("http://localhost/api/v1/pricing/estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("POST /api/v1/pricing/estimate", () => {
  it("accepts an allowlisted configuration and returns the exact 501 response", async () => {
    expect(parsePricingEstimateRequest(legalRequest)).toEqual(legalRequest);

    const response = await createPricingEstimateHandler()(
      request(JSON.stringify(legalRequest)),
    );
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body).toEqual({
      status: "not_available",
      message: "在线估算尚未开放，最终价格以商务报价为准。",
    });
    expect(body).toEqual(PRICING_ESTIMATE_NOT_AVAILABLE_RESPONSE);
    expect(JSON.stringify(body)).not.toMatch(/amount/iu);
  });

  it.each([
    ["invalid deployment", { ...legalRequest, deployment: "unknown" }],
    ["invalid scale", { ...legalRequest, scale: "unknown" }],
    ["invalid module", { ...legalRequest, modules: ["unknown"] }],
    [
      "duplicate modules",
      { ...legalRequest, modules: ["workflow", "workflow"] },
    ],
    ["empty modules", { ...legalRequest, modules: [] }],
    ["invalid term", { ...legalRequest, term: "unknown" }],
    [
      "missing deployment",
      {
        scale: legalRequest.scale,
        modules: legalRequest.modules,
        term: legalRequest.term,
      },
    ],
    [
      "missing scale",
      {
        deployment: legalRequest.deployment,
        modules: legalRequest.modules,
        term: legalRequest.term,
      },
    ],
    [
      "missing modules",
      {
        deployment: legalRequest.deployment,
        scale: legalRequest.scale,
        term: legalRequest.term,
      },
    ],
    [
      "missing term",
      {
        deployment: legalRequest.deployment,
        scale: legalRequest.scale,
        modules: legalRequest.modules,
      },
    ],
  ])("returns the exact 400 response for %s", async (_name, input) => {
    const response = await createPricingEstimateHandler()(
      request(JSON.stringify(input)),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: {
        code: "invalid_configuration",
        message: "价格配置无效。",
      },
    });
    expect(parsePricingEstimateRequest(input)).toBeNull();
    expect(INVALID_PRICING_CONFIGURATION_RESPONSE).toEqual({
      status: "error",
      error: {
        code: "invalid_configuration",
        message: "价格配置无效。",
      },
    });
  });

  it("returns the exact 400 response for malformed JSON", async () => {
    const response = await createPricingEstimateHandler()(request("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      INVALID_PRICING_CONFIGURATION_RESPONSE,
    );
  });

  it("rejects an oversized declared body with the stable 400 response", async () => {
    const oversized = request(JSON.stringify(legalRequest));
    oversized.headers.set("content-length", "4097");

    const response = await createPricingEstimateHandler()(oversized);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      INVALID_PRICING_CONFIGURATION_RESPONSE,
    );
  });

  it("rejects an oversized chunked body while streaming", async () => {
    const oversized = `${JSON.stringify(legalRequest)}${" ".repeat(4097)}`;
    const midpoint = Math.floor(oversized.length / 2);

    const response = await createPricingEstimateHandler()(
      streamingRequest([
        oversized.slice(0, midpoint),
        oversized.slice(midpoint),
      ]),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      INVALID_PRICING_CONFIGURATION_RESPONSE,
    );
  });

  it("exports POST only and keeps the route free of database dependencies", () => {
    expect(route.POST).toBeTypeOf("function");
    expect("GET" in route).toBe(false);
    expect(Object.keys(route)).toEqual(["POST"]);

    for (const path of [
      "src/app/api/v1/pricing/estimate/route.ts",
      "src/app/api/v1/pricing/estimate/handler.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(
        /database|drizzle|postgres|@ai-agent-platform\/database/iu,
      );
    }
  });
});
