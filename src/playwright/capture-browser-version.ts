import { currentVisualCaptureProfile } from "../node/capture-profile.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";

export function assertNativeCaptureBrowser(
  root: string,
  browser: VisualDeltaBrowser,
  version: string,
): void {
  const profile = currentVisualCaptureProfile(root);
  if (
    profile.schemaVersion === 2 &&
    profile.browserVersions[browser] !== version
  )
    throw new Error(
      `Native ${browser} reports ${version}, but the selected profile expects ${profile.browserVersions[browser]}. Use the installed Playwright browser or provide a matching native runner profile.`,
    );
}
