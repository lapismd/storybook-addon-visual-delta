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
      playwrightVersion: "1.62.1",
      imageDigest:
        "sha256:d96587d3f3eed2d1cbe63593566813b5f255576a28f27595dec6bb35e9936b71",
      arm64ImageDigest:
        "sha256:661cb2485c34efc928a3ab2b64b867ee02908a71145f6a2d8a61d6febfb8abc4",
      browserVersions: {
        chromium: "151.0.7922.34",
        firefox: "153.0",
        webkit: "26.5",
      },
      fontManifestSha256:
        "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3",
    });
    expect(visualCaptureProfileImageReference()).toBe(
      "ghcr.io/lapismd/storybook-addon-visual-delta-ci@sha256:661cb2485c34efc928a3ab2b64b867ee02908a71145f6a2d8a61d6febfb8abc4",
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
