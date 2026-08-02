/** Shared browser capture stream types (manager + middleware). */

import type {
  VisualBaselineEnvironment,
  VisualBaselineTarget,
} from "./environments.js";
import type { VisualCaptureProfile } from "./capture-profile.js";

export type CaptureSubjectPhase =
  | "launching"
  | "navigating"
  | "settling"
  | "capturing"
  | "encoding";

export type CaptureSubjectProgress = {
  phase: CaptureSubjectPhase;
  /** Human label for the panel Stop / progress control. */
  label: string;
};

export type CaptureSubjectResult = {
  ok: true;
  /** Raw PNG bytes as base64 (no data-URL prefix). */
  pngBase64: string;
  width: number;
  height: number;
  target: VisualBaselineTarget;
  /** Present only when capture ran through a declared profile. Host-local diagnostics omit it. */
  captureProfile?: VisualCaptureProfile;
  /** @deprecated Informational compatibility alias. */
  environment: VisualBaselineEnvironment;
};

export type CaptureSubjectStreamEvent =
  | {
      type: "start";
      storyId: string;
      target?: VisualBaselineTarget;
      captureProfile?: VisualCaptureProfile;
      environment?: VisualBaselineEnvironment;
    }
  | ({ type: "progress" } & CaptureSubjectProgress)
  | ({ type: "done" } & CaptureSubjectResult)
  | { type: "error"; error: string };
