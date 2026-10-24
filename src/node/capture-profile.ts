import { hostPlaywrightMetadata } from "./host-playwright.js";
import { release } from "node:os";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  type VisualCaptureProfile,
} from "../shared/capture-profile.js";
import { readCaptureConfiguration } from "./capture-configuration.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import { nativeFontManifestSha256 } from "./native-font-manifest.js";

export const VISUAL_DELTA_CAPTURE_PROFILE_METADATA_ENV =
  "VISUAL_DELTA_CAPTURE_PROFILE_METADATA";
export { hostPlaywright } from "./host-playwright.js";
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
  const { playwrightVersion, browserVersions } = hostPlaywrightMetadata(
    root,
    project.browsers,
  );
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
    fontManifestSha256:
      playwrightVersion === "unavailable" ? null : nativeFontManifestSha256(),
    nodeVersion: process.versions.node,
    npmVersion: "host",
    pnpmVersion: "host",
    playwrightVersion,
    browsers: project.browsers,
    browserVersions,
    deviceScaleFactor: project.defaults.deviceScaleFactor,
  };
}
export function supportsPersistentCaptureReuse(
  root: string,
  profile = currentVisualCaptureProfile(root),
): boolean {
  return profile.schemaVersion === 1 || Boolean(profile.fontManifestSha256);
}

export { captureCacheDir } from "./capture-configuration.js";
