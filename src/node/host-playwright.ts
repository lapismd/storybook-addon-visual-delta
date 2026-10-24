import { readFileSync } from "node:fs";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import type { NativeVisualCaptureProfile } from "../shared/capture-profile.js";
import { createRequire } from "node:module";
import path from "node:path";

export function hostPlaywright(root: string): typeof import("playwright") {
  try {
    return createRequire(path.join(root, "package.json"))(
      "playwright",
    ) as typeof import("playwright");
  } catch {
    throw new Error(
      "Install playwright and @playwright/test in the project, then run pnpm exec playwright install for native capture.",
    );
  }
}

export function hostPlaywrightMetadata(
  root: string,
  browsers: readonly VisualDeltaBrowser[],
) {
  let playwrightVersion = "unavailable";
  const browserVersions: NativeVisualCaptureProfile["browserVersions"] = {};
  try {
    const requireHost = createRequire(path.join(root, "package.json"));
    const playwrightManifest = requireHost.resolve("playwright/package.json");
    playwrightVersion = (
      JSON.parse(readFileSync(playwrightManifest, "utf8")) as {
        version: string;
      }
    ).version;
    const coreRoot = path.dirname(
      createRequire(playwrightManifest).resolve("playwright-core/package.json"),
    );
    const manifest = JSON.parse(
      readFileSync(path.join(coreRoot, "browsers.json"), "utf8"),
    ) as { browsers: Array<{ name: string; browserVersion?: string }> };
    for (const browser of browsers)
      browserVersions[browser] = manifest.browsers.find(
        (entry) => entry.name === browser,
      )?.browserVersion;
  } catch {
    /* Availability is reported by validation and the explicit probe. */
  }
  return { playwrightVersion, browserVersions };
}
