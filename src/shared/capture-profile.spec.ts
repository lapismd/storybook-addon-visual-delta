import { describe, expect, it } from "vitest";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  validateVisualCaptureProfile,
  visualCaptureProfileImageReference,
} from "./capture-profile.js";

describe("canonical capture profile", () => {
  it("locks the reviewed Linux ARM64 publication profile", () => {
    expect(CANONICAL_VISUAL_CAPTURE_PROFILE).toMatchObject({
      os: "linux",
      architecture: "arm64",
      playwrightVersion: "1.61.1",
      imageDigest:
        "sha256:5ddf2fdea54c34ce52e6eae564512d417b024739ce47bc51d81216e10c27623a",
      arm64ImageDigest:
        "sha256:71968d021eb75280f66dec675bc2b8b9e2224734cf58ca1ea0c06019969df705",
      browserVersions: {
        chromium: "149.0.7827.0",
        firefox: "151.0",
        webkit: "26.5",
      },
      fontManifestSha256:
        "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3",
    });
    expect(visualCaptureProfileImageReference()).toBe(
      "ghcr.io/lapismd/storybook-addon-visual-delta-ci@sha256:71968d021eb75280f66dec675bc2b8b9e2224734cf58ca1ea0c06019969df705",
    );
    expect(validateVisualCaptureProfile(CANONICAL_VISUAL_CAPTURE_PROFILE)).toEqual([]);
  });

  it("builds an immutable reference for a locked profile", () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const fontDigest = `sha256:${"b".repeat(64)}` as const;
    const profile = {
      ...CANONICAL_VISUAL_CAPTURE_PROFILE,
      imageDigest: digest,
      arm64ImageDigest: digest,
      browserVersions: {
        chromium: "fixture",
        firefox: "fixture",
        webkit: "fixture",
      },
      fontManifestSha256: fontDigest,
    };
    expect(validateVisualCaptureProfile(profile)).toEqual([]);
    expect(visualCaptureProfileImageReference(profile)).toBe(
      `${profile.image}@${digest}`,
    );
  });
});
