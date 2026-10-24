import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  type VisualCaptureProfile,
} from "./capture-profile.js";
export type CapturePresentation = {
  captureProfile: VisualCaptureProfile;
  artifactNamespace?: string;
};
const key = "__STORYBOOK_VISUAL_DELTA_CAPTURE__";
let resolved: CapturePresentation | undefined;
export function rememberCapturePresentation(value: CapturePresentation): void {
  resolved = value;
}
export function capturePresentation(): CapturePresentation {
  return (
    resolved ??
    ((globalThis as Record<string, unknown>)[key] as CapturePresentation) ?? {
      captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
    }
  );
}
export function captureProfileLabel(profile: VisualCaptureProfile): string {
  return `${profile.os === "darwin" ? "macOS" : "Linux"} · ${profile.architecture === "arm64" ? "ARM64" : "x64"}${profile.schemaVersion === 2 ? " · Native" : ""}`;
}
export function renderCaptureManagerHead(value: CapturePresentation): string {
  return `<script>globalThis.${key}=${JSON.stringify(value).replaceAll("<", "\\u003c")};</script>`;
}
