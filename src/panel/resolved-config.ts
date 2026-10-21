import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import { capturePresentation } from "../shared/capture-presentation.js";
export function normalizePanelConfig(
  config: VisualDeltaResolvedConfig,
): VisualDeltaResolvedConfig {
  return {
    ...config,
    browsers:
      Array.isArray(config.browsers) && config.browsers.length > 0
        ? config.browsers
        : ["chromium"],
    runtimePlatform: config.runtimePlatform || "linux",
    availableEnvironments: Array.isArray(config.availableEnvironments)
      ? config.availableEnvironments
      : [],
    availableBrowsers: Array.isArray(config.availableBrowsers)
      ? config.availableBrowsers
      : [],
    captureProfile:
      config.captureProfile ?? capturePresentation().captureProfile,
    captureRunner: config.captureRunner ?? {
      kind: "docker",
      available: false,
      reason: "The canonical capture profile is not locked.",
    },
  };
}
