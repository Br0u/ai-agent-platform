import { describe, expect, it } from "vitest";

import { resolveAssistantPublicOrigin } from "./assistant-public-origin";

describe("assistant public origin", () => {
  it.each([
    "https://portal.example.com",
    "https://portal.example.com:8443",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "http://[::1]:3000",
  ])("accepts an exact safe origin: %s", (value) => {
    expect(
      resolveAssistantPublicOrigin({
        NODE_ENV: "production",
        ASSISTANT_PUBLIC_ORIGIN: value,
      }).origin,
    ).toBe(value);
  });

  it("requires an explicit origin in production", () => {
    expect(() =>
      resolveAssistantPublicOrigin({ NODE_ENV: "production" }),
    ).toThrow("ASSISTANT_PUBLIC_ORIGIN is required in production");
  });

  it.each([
    "http://portal.example.com",
    "ftp://portal.example.com",
    "https://user:password@portal.example.com",
    "https://portal.example.com/",
    "https://portal.example.com/path",
    "https://portal.example.com?query=1",
    "https://portal.example.com#fragment",
    " https://portal.example.com",
    "https://portal.example.com:443",
  ])("rejects an unsafe or non-exact origin: %s", (value) => {
    expect(() =>
      resolveAssistantPublicOrigin({
        NODE_ENV: "production",
        ASSISTANT_PUBLIC_ORIGIN: value,
      }),
    ).toThrow();
  });

  it("uses localhost only as the non-production default", () => {
    expect(resolveAssistantPublicOrigin({ NODE_ENV: "development" }).href).toBe(
      "http://localhost:3000/",
    );
    expect(resolveAssistantPublicOrigin({ NODE_ENV: "test" }).href).toBe(
      "http://localhost:3000/",
    );
  });
});
