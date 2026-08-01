import type { CaptureSubjectProgress } from "./capture-subject-types.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import type { VisualDeltaChangeSetMutation } from "./change-sets.js";
import type {
  VisualBaselineEnvironment,
  VisualBaselineTarget,
  VisualDeltaBrowser,
} from "./environments.js";
import type { VisualCaptureProfile } from "./capture-profile.js";

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
  /** Playwright browser for this exact comparison; defaults to Chromium. */
  browser?: VisualDeltaBrowser;
  /**
   * Explicit identity for a story-wired teaching asset whose URL has no
   * canonical browser suffix. Canonical filename identity remains authoritative.
   */
  target?: VisualBaselineTarget;
};

export type CompareStoryResult = {
  ok: true;
  storyId: string;
  sidecar: VisualDiffSidecar;
  target: VisualBaselineTarget;
  captureProfile?: VisualCaptureProfile;
  /** @deprecated Informational compatibility alias. */
  environment: VisualBaselineEnvironment;
  review?: {
    autoAccepted: true;
    applied: boolean;
    status: "approved";
    error?: string;
    changes?: VisualDeltaChangeSetMutation;
  };
};

export type CompareStoryStreamEvent =
  | {
      type: "start";
      storyId: string;
      target?: VisualBaselineTarget;
      captureProfile?: VisualCaptureProfile;
      environment?: VisualBaselineEnvironment;
    }
  | ({ type: "progress" } & CaptureSubjectProgress)
  | ({ type: "done" } & CompareStoryResult)
  | { type: "error"; error: string };
