import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { release } from "node:os";
import path from "node:path";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  type VisualCaptureProfile,
  type NativeVisualCaptureProfile,
} from "../shared/capture-profile.js";
import { readCaptureConfiguration } from "./capture-configuration.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";

export const VISUAL_DELTA_CAPTURE_PROFILE_METADATA_ENV =
  "VISUAL_DELTA_CAPTURE_PROFILE_METADATA";
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
export function currentVisualCaptureProfile(
  root = process.cwd(),
): VisualCaptureProfile {
  const frozen = process.env[VISUAL_DELTA_CAPTURE_PROFILE_METADATA_ENV];
  if (frozen) return JSON.parse(frozen) as VisualCaptureProfile;
  const config = readCaptureConfiguration(root);
  if (config.profiles[config.profile]!.adapter !== "native")
    return CANONICAL_VISUAL_CAPTURE_PROFILE;
  if (
    !["darwin", "linux"].includes(process.platform) ||
    !["arm64", "x64"].includes(process.arch)
  )
    throw new Error("Native capture requires macOS or Linux on ARM64 or x64.");
  const project = readVisualDeltaProjectConfig(root);
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
    for (const browser of project.browsers)
      browserVersions[browser] = manifest.browsers.find(
        (entry) => entry.name === browser,
      )?.browserVersion;
  } catch {
    /* Availability is reported by validation and the explicit probe. */
  }
  return {
    ...CANONICAL_VISUAL_CAPTURE_PROFILE,
    schemaVersion: 2,
    kind: "native",
    id: `${config.profile}-${process.platform}-${process.arch}`,
    os: process.platform as "darwin" | "linux",
    architecture: process.arch as "arm64" | "x64",
    osVersion: release(),
    image: null,
    imageDigest: null,
    arm64ImageDigest: null,
    fontManifestSha256: null,
    nodeVersion: process.versions.node,
    npmVersion: "host",
    pnpmVersion: "host",
    playwrightVersion,
    browsers: project.browsers,
    browserVersions,
    deviceScaleFactor: project.defaults.deviceScaleFactor,
  };
}
export function supportsPersistentCaptureReuse(root: string): boolean {
  const profile = currentVisualCaptureProfile(root);
  return profile.schemaVersion === 1 || Boolean(profile.fontManifestSha256);
}

export { captureCacheDir } from "./capture-configuration.js";
