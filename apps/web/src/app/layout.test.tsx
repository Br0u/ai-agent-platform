import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "mock-brand-font" }),
}));

import { viewport } from "./layout";

describe("root layout viewport", () => {
  it("keeps client navigation pinned to the physical mobile viewport", () => {
    expect(viewport).toEqual({ width: "device-width", initialScale: 1 });
  });
});
