import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import { loadPlaywrightDiffResult } from "./load-playwright-diff.js";
vi.mock("./capture.js", () => ({
  loadImage: vi.fn(async () => ({
    width: 1,
    height: 1,
    dataUrl: "data:image/png;base64,fixture",
    imageData: { data: new Uint8ClampedArray(4) },
  })),
}));
vi.mock("./diff-assets.js", () => ({
  buildFocusAssets: () => ({
    focusDataUrl: "data:image/png;base64,focus",
    changeBounds: null,
  }),
}));
afterEach(() => vi.unstubAllGlobals());
describe("profile-aware result hydration", () => {
  const profile = {
    ...CANONICAL_VISUAL_CAPTURE_PROFILE,
    schemaVersion: 2 as const,
    kind: "native" as const,
    id: "native-darwin-arm64",
    os: "darwin" as const,
    architecture: "arm64" as const,
    osVersion: "27.0",
    image: null,
    imageDigest: null,
    arm64ImageDigest: null,
    fontManifestSha256: null,
  };
  function response(captureProfile = profile) {
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    return {
      version: 4,
      storyId: "button--basic",
      snapshotRel: "button--basic.png",
      status: "passed",
      tool: "playwright",
      generatedAt: "now",
      captureProfile,
      baselineHash: hash,
      actualHash: hash,
      captureConfigHash: "config",
      captureOperationId: "capture",
      actualCapturedAt: "now",
      renderFingerprint: "inputs",
      variant: { kind: "primary" },
      captureSet: [
        {
          variant: { kind: "primary" },
          baselineRelative: "button--basic-chromium.png",
        },
      ],
      actualRel:
        "profiles/native/darwin-arm64/button--basic-chromium.actual.png",
      diffRel: "profiles/native/darwin-arm64/button--basic-chromium.diff.png",
      capturedWidth: 1,
      capturedHeight: 1,
      outcome: "passed",
    };
  }
  it("loads native artifacts from the selected namespace and verifies their bytes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fetch = vi.fn(async (url: string) =>
      url.includes(".result.json")
        ? { ok: true, json: async () => response() }
        : {
            ok: true,
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          },
    );
    vi.stubGlobal("fetch", fetch);
    const result = await loadPlaywrightDiffResult(
      "/visual-baselines/button--basic-chromium.png",
      1,
      {
        captureProfile: profile,
        artifactNamespace: "profiles/native/darwin-arm64",
      },
    );
    expect(result?.passed).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/visual-delta-artifacts/profiles/native/darwin-arm64/button--basic-chromium.result.json?t=1",
      { cache: "no-store" },
    );
  });
  it("rejects another profile instead of hydrating its result", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response(),
    }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await loadPlaywrightDiffResult(
        "/visual-baselines/button--basic-chromium.png",
        1,
        {
          captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
          artifactNamespace: "profiles/native/darwin-arm64",
        },
      ),
    ).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
