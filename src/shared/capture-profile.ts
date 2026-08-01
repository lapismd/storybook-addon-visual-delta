import type { VisualDeltaBrowser } from "./environments.js";

export const VISUAL_CAPTURE_PROFILE_SCHEMA_VERSION = 1 as const;
export const CANONICAL_VISUAL_CAPTURE_PROFILE_ID =
  "visual-delta-linux-arm64-v1" as const;
export const VISUAL_DELTA_CI_IMAGE =
  "ghcr.io/lapismd/storybook-addon-visual-delta-ci" as const;

export type VisualCaptureProfile = {
  schemaVersion: typeof VISUAL_CAPTURE_PROFILE_SCHEMA_VERSION;
  id: string;
  os: "linux";
  architecture: "arm64";
  image: string;
  /** Immutable multi-architecture image manifest digest. */
  imageDigest: `sha256:${string}` | null;
  /** Immutable Linux/ARM64 child-manifest digest used by canonical workers. */
  arm64ImageDigest: `sha256:${string}` | null;
  nodeVersion: string;
  npmVersion: string;
  pnpmVersion: string;
  playwrightVersion: string;
  browsers: readonly VisualDeltaBrowser[];
  browserVersions: Partial<Record<VisualDeltaBrowser, string>>;
  locale: string;
  timezoneId: string;
  colorScheme: "light";
  reducedMotion: "reduce";
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  rendering: {
    animations: "disabled";
    caret: "hide";
    screenshotScale: "device";
  };
  fontManifestSha256: `sha256:${string}` | null;
};

export const CANONICAL_VISUAL_CAPTURE_PROFILE: VisualCaptureProfile = {
  schemaVersion: VISUAL_CAPTURE_PROFILE_SCHEMA_VERSION,
  id: CANONICAL_VISUAL_CAPTURE_PROFILE_ID,
  os: "linux",
  architecture: "arm64",
  image: VISUAL_DELTA_CI_IMAGE,
  imageDigest: null,
  arm64ImageDigest: null,
  nodeVersion: "24.15.0",
  npmVersion: "12.0.2",
  pnpmVersion: "10.32.1",
  playwrightVersion: "1.61.1",
  browsers: ["chromium", "firefox", "webkit"],
  browserVersions: {},
  locale: "en-GB",
  timezoneId: "Europe/London",
  colorScheme: "light",
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  rendering: {
    animations: "disabled",
    caret: "hide",
    screenshotScale: "device",
  },
  fontManifestSha256: null,
};

export function visualCaptureProfileImageReference(
  profile: VisualCaptureProfile = CANONICAL_VISUAL_CAPTURE_PROFILE,
): string | null {
  return profile.arm64ImageDigest
    ? `${profile.image}@${profile.arm64ImageDigest}`
    : null;
}

export function validateVisualCaptureProfile(
  profile: VisualCaptureProfile,
): string[] {
  const errors: string[] = [];
  if (profile.schemaVersion !== VISUAL_CAPTURE_PROFILE_SCHEMA_VERSION) {
    errors.push(`Unsupported capture profile schema ${profile.schemaVersion}.`);
  }
  if (profile.os !== "linux" || profile.architecture !== "arm64") {
    errors.push("Canonical capture profile must be Linux/ARM64.");
  }
  if (!profile.imageDigest) {
    errors.push(
      "Canonical ARM64 image digest is not locked. Publish the CI image, then update the capture-profile lock.",
    );
  } else if (!/^sha256:[a-f0-9]{64}$/.test(profile.imageDigest)) {
    errors.push("Capture profile imageDigest must be a sha256 digest.");
  }
  if (!profile.arm64ImageDigest) {
    errors.push("Canonical ARM64 child-manifest digest is not locked.");
  } else if (!/^sha256:[a-f0-9]{64}$/.test(profile.arm64ImageDigest)) {
    errors.push("Capture profile arm64ImageDigest must be a sha256 digest.");
  }
  for (const browser of profile.browsers) {
    if (!profile.browserVersions[browser]) {
      errors.push(`Capture profile ${browser} version is not locked.`);
    }
  }
  if (!profile.fontManifestSha256) {
    errors.push("Capture profile font manifest is not locked.");
  } else if (!/^sha256:[a-f0-9]{64}$/.test(profile.fontManifestSha256)) {
    errors.push("Capture profile fontManifestSha256 must be a sha256 digest.");
  }
  return errors;
}
