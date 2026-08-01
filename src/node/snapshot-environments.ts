import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  VISUAL_DELTA_BROWSERS,
  parseVisualBaselineEnvironment,
  visualBaselineEnvironmentKey,
  type VisualBaselineEnvironment,
} from "../shared/environments.js";

const DIAGNOSTIC_PNG_RE = /\.(?:actual|diff)\.png$/i;

/** Discover canonical Browser × OS identities beneath one snapshot root. */
export function discoverSnapshotEnvironments(
  snapshotDir: string,
): VisualBaselineEnvironment[] {
  const environments = new Map<string, VisualBaselineEnvironment>();
  const directories = [snapshotDir];

  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) continue;

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.push(join(directory, entry.name));
        continue;
      }
      if (
        !entry.isFile() ||
        !entry.name.toLowerCase().endsWith(".png") ||
        DIAGNOSTIC_PNG_RE.test(entry.name)
      ) {
        continue;
      }
      const environment = parseVisualBaselineEnvironment(entry.name);
      if (environment) {
        environments.set(
          visualBaselineEnvironmentKey(environment),
          environment,
        );
      }
    }
  }

  return [...environments.values()].sort((left, right) => {
    const browserOrder =
      VISUAL_DELTA_BROWSERS.indexOf(left.browser) -
      VISUAL_DELTA_BROWSERS.indexOf(right.browser);
    return browserOrder || left.platform.localeCompare(right.platform);
  });
}
