import { describe, expect, it } from "vitest";
import {
  buildPricingContactHref,
  parsePricingContactQuery,
} from "./pricing-query";

describe("pricing contact query", () => {
  it("builds an exact allowlisted contact href", () => {
    expect(
      buildPricingContactHref({
        deployment: "local-private",
        scale: "pilot",
        modules: ["workflow", "agent-studio", "workflow"],
        term: "1y",
      }),
    ).toBe(
      "/contact?source=pricing&deployment=local-private&scale=pilot&modules=agent-studio%2Cworkflow&term=1y",
    );
  });

  it("ignores unknown IDs and normalizes duplicate modules", () => {
    expect(
      parsePricingContactQuery({
        source: "pricing",
        deployment: "unknown",
        scale: "department",
        modules: "workflow,unknown,agent-studio,workflow",
        term: "unknown",
      }),
    ).toEqual({
      deployment: "local-private",
      scale: "department",
      modules: ["agent-studio", "workflow"],
      term: "tbd",
    });
  });

  it("returns no selection without the pricing source", () => {
    expect(
      parsePricingContactQuery({
        deployment: "dedicated-cloud",
        scale: "enterprise",
        modules: "observability",
        term: "3y",
      }),
    ).toBeNull();
  });
});
