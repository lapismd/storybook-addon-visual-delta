import { describe, expect, it } from "vitest";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  validateVisualCaptureProfile,
  visualCaptureProfileImageReference,
} from "./capture-profile.js";

describe("canonical capture profile", () => {
  it("is Linux ARM64 and remains safely unlocked before publication", () => {
    expect(CANONICAL_VISUAL_CAPTURE_PROFILE).toMatchObject({
      os: "linux",
      architecture: "arm64",
      playwrightVersion: "1.61.1",
    });
    expect(visualCaptureProfileImageReference()).toBeNull();
    expect(validateVisualCaptureProfile(CANONICAL_VISUAL_CAPTURE_PROFILE)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("image digest is not locked"),
        expect.stringContaining("ARM64 child-manifest digest is not locked"),
        expect.stringContaining("font manifest is not locked"),
      ]),
    );
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
