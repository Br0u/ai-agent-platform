export type FeatureModule = "license" | "downloads" | "openlab";

export function getFeatureStatus(module: FeatureModule, enabled: boolean) {
  if (!enabled) {
    return {
      module,
      enabled: false,
      mode: "placeholder" as const,
      errorCode: "FEATURE_DISABLED" as const,
    };
  }

  return {
    module,
    enabled: true,
    mode: "live" as const,
  };
}
