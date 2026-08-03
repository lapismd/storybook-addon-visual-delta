import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";

function positiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Format the authoritative capture geometry returned by the runner. This does
 * not depend on the panel being able to hydrate the actual or diff images.
 */
export function formatPlaywrightCaptureDiagnostics(
  sidecar: VisualDiffSidecar,
): string | null {
  const viewport = sidecar.viewport;
  const deviceScaleFactor = sidecar.deviceScaleFactor;
  const capturedWidth = sidecar.capturedWidth ?? sidecar.imageWidth;
  const capturedHeight = sidecar.capturedHeight ?? sidecar.imageHeight;

  if (
    !viewport ||
    !positiveFinite(viewport.width) ||
    !positiveFinite(viewport.height) ||
    !positiveFinite(deviceScaleFactor) ||
    !positiveFinite(capturedWidth) ||
    !positiveFinite(capturedHeight)
  ) {
    return null;
  }

  return (
    `playwright · viewport requested ${viewport.width}×${viewport.height}, ` +
    `observed ${viewport.width}×${viewport.height} at ${deviceScaleFactor}× · ` +
    `bitmap ${capturedWidth}×${capturedHeight}`
  );
}
