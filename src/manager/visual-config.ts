import { VISUAL_DELTA_CONFIG_PATH } from "../constants.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import { rememberCapturePresentation } from "../shared/capture-presentation.js";
/** Read resolved host options + onboarding status. */
export async function fetchVisualConfig(): Promise<VisualDeltaResolvedConfig> {
  const response = await fetch(VISUAL_DELTA_CONFIG_PATH);
  if (!response.ok) {
    throw new Error(`Config request failed (${response.status})`);
  }
  const config = (await response.json()) as VisualDeltaResolvedConfig;
  if (config.captureProfile) rememberCapturePresentation(config);
  return config;
}
