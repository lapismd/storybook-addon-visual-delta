/** Shared Chromium Diff capture stream types (manager + middleware). */

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
};

export type CaptureSubjectStreamEvent =
  | { type: "start"; storyId: string }
  | ({ type: "progress" } & CaptureSubjectProgress)
  | ({ type: "done" } & CaptureSubjectResult)
  | { type: "error"; error: string };
