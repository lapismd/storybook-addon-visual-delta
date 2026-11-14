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
      playwrightVersion: "1.65.0",
      imageDigest:
        "sha256:6b8f1165410982f4b7a5573bceefd008a6d349c23c48825231ec51b0e89dd948",
      arm64ImageDigest:
        "sha256:1905b9652af6acc73e656193a78b9ee9a86a17c19a79bef0df60da133c375a27",
      browserVersions: {
        chromium: "158.0.8127.18",
        firefox: "159.0",
        webkit: "27.2",
      },
      fontManifestSha256:
        "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3",
    });
    expect(visualCaptureProfileImageReference()).toBe(
      "ghcr.io/lapismd/storybook-addon-visual-delta-ci@sha256:1905b9652af6acc73e656193a78b9ee9a86a17c19a79bef0df60da133c375a27",
    );
    expect(
      validateVisualCaptureProfile(CANONICAL_VISUAL_CAPTURE_PROFILE),
    ).toEqual([]);
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

it("accepts truthful native provenance without container or font locks", () => {
  const profile = {
    ...CANONICAL_VISUAL_CAPTURE_PROFILE,
    schemaVersion: 2 as const,
    kind: "native" as const,
    id: "native-darwin-arm64",
    os: "darwin" as const,
    architecture: "arm64" as const,
    osVersion: "27.0.0",
    image: null,
    imageDigest: null,
    arm64ImageDigest: null,
    fontManifestSha256: null,
  };
  expect(validateVisualCaptureProfile(profile)).toEqual([]);
  expect(visualCaptureProfileImageReference(profile)).toBeNull();
  expect(
    validateVisualCaptureProfile({
      ...profile,
      playwrightVersion: "unavailable",
    }),
  ).toContain(
    "Native capture runtime metadata is incomplete; install project Playwright dependencies.",
  );
});
