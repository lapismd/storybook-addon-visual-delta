import type { CaptureSubjectProgress } from "./capture-subject-types.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";

export type CompareStoryEntry = {
  id: string;
  title?: string;
  name?: string;
  importPath?: string;
  tags?: string[];
};

export type CompareStoryRequest = {
  origin: string;
  storyId: string;
  /** Current dev-manager story metadata; avoids consulting stale static output. */
  story?: CompareStoryEntry;
  baselineUrl: string;
  align?: "viewport" | "canvas";
  visualCaptureUntil?: string;
  /** Exact Storybook instrumenter call for an ordinary interaction baseline. */
  visualCaptureCallId?: string;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  delay?: number;
  ignoreSelectors?: string[];
  cropToViewport?: boolean;
  passThresholdPercent?: number;
  diffThreshold?: number;
  includeAntiAliasing?: boolean;
  mode?: string;
  /** Storybook `globals` query serialization for a selected visual mode. */
  globals?: string;
};

export type CompareStoryResult = {
  ok: true;
  storyId: string;
  sidecar: VisualDiffSidecar;
};

export type CompareStoryStreamEvent =
  | { type: "start"; storyId: string }
  | ({ type: "progress" } & CaptureSubjectProgress)
  | ({ type: "done" } & CompareStoryResult)
  | { type: "error"; error: string };
