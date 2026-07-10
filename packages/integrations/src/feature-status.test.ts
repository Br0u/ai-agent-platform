import { describe, expect, it } from "vitest";
import { getFeatureStatus } from "./feature-status";

describe("getFeatureStatus", () => {
  it("returns the stable disabled contract for unavailable modules", () => {
    expect(getFeatureStatus("license", false)).toEqual({
      module: "license",
      enabled: false,
      mode: "placeholder",
      errorCode: "FEATURE_DISABLED",
    });
  });

  it("does not report a disabled error for enabled modules", () => {
    expect(getFeatureStatus("downloads", true)).toEqual({
      module: "downloads",
      enabled: true,
      mode: "live",
    });
  });
});
