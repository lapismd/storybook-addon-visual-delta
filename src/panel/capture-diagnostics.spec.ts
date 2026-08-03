import { describe, expect, it } from "vitest";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import { formatPlaywrightCaptureDiagnostics } from "./capture-diagnostics.js";

function sidecar(
  overrides: Partial<VisualDiffSidecar> = {},
): VisualDiffSidecar {
  return {
    version: 4,
    storyId: "examples-card--default",
    snapshotRel: "examples/card/default.png",
    status: "passed",
    generatedAt: "2026-08-03T10:00:00.000Z",
    tool: "playwright",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 3,
    capturedWidth: 3744,
    capturedHeight: 1632,
    ...overrides,
  };
}

describe("capture diagnostics", () => {
  it("formats the authoritative viewport, density, and captured bitmap", () => {
    expect(formatPlaywrightCaptureDiagnostics(sidecar())).toBe(
      "playwright · viewport requested 1280×900, observed 1280×900 at 3× · bitmap 3744×1632",
    );
  });

  it("falls back to the compared image dimensions for legacy sidecars", () => {
    expect(
      formatPlaywrightCaptureDiagnostics(
        sidecar({
          capturedWidth: undefined,
          capturedHeight: undefined,
          imageWidth: 3840,
          imageHeight: 2700,
        }),
      ),
    ).toContain("bitmap 3840×2700");
  });

  it("does not expose incomplete or invalid geometry", () => {
    expect(
      formatPlaywrightCaptureDiagnostics(sidecar({ viewport: undefined })),
    ).toBeNull();
    expect(
      formatPlaywrightCaptureDiagnostics(
        sidecar({ capturedWidth: 0, capturedHeight: 0 }),
      ),
    ).toBeNull();
  });
});
