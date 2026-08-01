import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  VISUAL_DELTA_BROWSERS,
  parseVisualBaselineTarget,
  type VisualDeltaBrowser,
} from "../shared/environments.js";

const DIAGNOSTIC_PNG_RE = /\.(?:actual|diff)\.png$/i;

/** Discover canonical browser identities beneath one snapshot root. */
export function discoverSnapshotBrowsers(
  snapshotDir: string,
): VisualDeltaBrowser[] {
  const browsers = new Set<VisualDeltaBrowser>();
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
      const target = parseVisualBaselineTarget(entry.name);
      if (target) browsers.add(target.browser);
    }
  }

  return [...browsers].sort(
    (left, right) =>
      VISUAL_DELTA_BROWSERS.indexOf(left) -
      VISUAL_DELTA_BROWSERS.indexOf(right),
  );
}
