import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createAssistantStatusHandler } from "./handler";
import * as route from "./route";

describe("GET /api/v1/assistant/status", () => {
  it("returns the exact versioned placeholder status", async () => {
    const GET = createAssistantStatusHandler({
      requestIdFactory: () => "req-2",
      getStatus: async () => ({
        live: true,
        ready: true,
        capability: "placeholder",
        message: "模型尚未配置，当前为安全占位模式。",
      }),
    });

    const response = await GET(
      new Request("http://localhost/api/v1/assistant/status"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "req-2",
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
  });

  it("accepts only a bounded correlation id and exposes no credentials", async () => {
    const GET = createAssistantStatusHandler({
      requestIdFactory: () => "generated-request-id",
      getStatus: async () => ({
        live: false,
        ready: false,
        capability: "degraded",
        message: "助手基础服务暂不可用。",
      }),
    });

    const response = await GET(
      new Request("http://localhost/api/v1/assistant/status", {
        headers: { "x-request-id": "unsafe request id with spaces" },
      }),
    );
    const body = await response.json();

    expect(body.requestId).toBe("generated-request-id");
    expect(JSON.stringify(body)).not.toMatch(
      /cookie|credential|token|secret|agent:7777|stack/iu,
    );
    expect(body).toMatchObject({
      live: false,
      ready: false,
      capability: "degraded",
    });
  });

  it("maps runtime configuration failures to one safe degraded envelope", async () => {
    const GET = createAssistantStatusHandler({
      requestIdFactory: () => "req-safe",
      getStatus: async () => {
        throw new Error(
          "AGENTOS_INTERNAL_URL=http://agent:7777 OS_SECURITY_KEY=private",
        );
      },
    });

    const response = await GET(
      new Request("http://localhost/api/v1/assistant/status"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      version: "1",
      requestId: "req-safe",
      live: false,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
    expect(JSON.stringify(body)).not.toMatch(/agent:7777|private|key/iu);
  });

  it("normalizes contradictory runtime status before returning it publicly", async () => {
    const GET = createAssistantStatusHandler({
      requestIdFactory: () => "req-invariant",
      getStatus: async () => ({
        live: false,
        ready: true,
        capability: "available",
        message: "raw contradictory status",
      }),
    });

    const response = await GET(
      new Request("http://localhost/api/v1/assistant/status"),
    );

    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "req-invariant",
      live: false,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
  });

  it("exports GET only", () => {
    expect(route.GET).toBeTypeOf("function");
    expect("POST" in route).toBe(false);
    expect(Object.keys(route)).toEqual(["GET"]);

    const source = readFileSync(
      "src/app/api/v1/assistant/status/route.ts",
      "utf8",
    );
    expect(source).not.toMatch(/export\s+(?:const|function)\s+POST/u);
  });
});
