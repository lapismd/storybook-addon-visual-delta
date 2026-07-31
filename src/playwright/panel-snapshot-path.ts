/**
 * Panel acceptance has one committed, deterministic reference set. Keep the
 * expected path independent of the runner OS so Linux CI reads it too.
 */
export const PANEL_SCREENSHOT_PATH_TEMPLATE =
  "{testDir}/{testFileName}-snapshots/{arg}-chromium-darwin{ext}";

export function panelScreenshotExpect() {
  return {
    animations: "disabled" as const,
    caret: "hide" as const,
    maxDiffPixelRatio: 0,
    pathTemplate: PANEL_SCREENSHOT_PATH_TEMPLATE,
    scale: "device" as const,
  };
}
