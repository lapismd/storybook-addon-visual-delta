/** Shared browser capture stream types (manager + middleware). */

import type { VisualBaselineEnvironment } from "./environments.js";

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
  environment: VisualBaselineEnvironment;
};

export type CaptureSubjectStreamEvent =
  | { type: "start"; storyId: string; environment?: VisualBaselineEnvironment }
  | ({ type: "progress" } & CaptureSubjectProgress)
  | ({ type: "done" } & CaptureSubjectResult)
  | { type: "error"; error: string };
