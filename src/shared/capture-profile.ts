import type { VisualDeltaBrowser } from "./environments.js";

export const VISUAL_CAPTURE_PROFILE_SCHEMA_VERSION = 1 as const;
export const CANONICAL_VISUAL_CAPTURE_PROFILE_ID =
  "visual-delta-linux-arm64-v1" as const;
export const VISUAL_DELTA_CI_IMAGE =
  "ghcr.io/lapismd/storybook-addon-visual-delta-ci" as const;

export type ContainerVisualCaptureProfile = {
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

export type NativeVisualCaptureProfile = Omit<
  ContainerVisualCaptureProfile,
  | "schemaVersion"
  | "os"
  | "architecture"
  | "image"
  | "imageDigest"
  | "arm64ImageDigest"
> & {
  schemaVersion: 2;
  kind: "native";
  os: "darwin" | "linux";
  architecture: "arm64" | "x64";
  osVersion: string;
  image: null;
  imageDigest: null;
  arm64ImageDigest: null;
};
export type VisualCaptureProfile =
  | ContainerVisualCaptureProfile
  | NativeVisualCaptureProfile;

export const CANONICAL_VISUAL_CAPTURE_PROFILE: ContainerVisualCaptureProfile = {
  schemaVersion: VISUAL_CAPTURE_PROFILE_SCHEMA_VERSION,
  id: CANONICAL_VISUAL_CAPTURE_PROFILE_ID,
  os: "linux",
  architecture: "arm64",
  image: VISUAL_DELTA_CI_IMAGE,
  imageDigest:
    "sha256:d96587d3f3eed2d1cbe63593566813b5f255576a28f27595dec6bb35e9936b71",
  arm64ImageDigest:
    "sha256:661cb2485c34efc928a3ab2b64b867ee02908a71145f6a2d8a61d6febfb8abc4",
  nodeVersion: "24.15.0",
  npmVersion: "12.0.2",
  pnpmVersion: "10.32.1",
  playwrightVersion: "1.62.1",
  browsers: ["chromium", "firefox", "webkit"],
  browserVersions: {
    chromium: "151.0.7922.34",
    firefox: "153.0",
    webkit: "26.5",
  },
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
  fontManifestSha256:
    "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3",
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
  if ("kind" in profile && profile.kind === "native") {
    if (
      profile.schemaVersion !== 2 ||
      !["darwin", "linux"].includes(profile.os) ||
      !["arm64", "x64"].includes(profile.architecture)
    )
      errors.push("Native capture requires macOS or Linux on ARM64 or x64.");
    if (
      !profile.id ||
      !profile.osVersion ||
      !profile.nodeVersion ||
      !/^\d+\./.test(profile.playwrightVersion)
    )
      errors.push(
        "Native capture runtime metadata is incomplete; install project Playwright dependencies.",
      );
    if (
      !profile.browsers.length ||
      profile.browsers.some((browser) => !profile.browserVersions[browser])
    )
      errors.push("Native browser version metadata is incomplete.");
    if (profile.image || profile.imageDigest || profile.arm64ImageDigest)
      errors.push("Native capture must not claim a container image.");
    if (
      profile.fontManifestSha256 &&
      !/^sha256:[a-f0-9]{64}$/.test(profile.fontManifestSha256)
    )
      errors.push(
        "Native font manifest must be a sha256 digest when supplied.",
      );
    return errors;
  }
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
