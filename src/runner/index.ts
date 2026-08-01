import type { VisualCaptureProfile } from "../shared/capture-profile.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import type { VisualTestFailureMode } from "../shared/failure-mode.js";

export type VisualCaptureOperation =
  | "test"
  | "update"
  | "interaction-update";

export type VisualCaptureJobManifest = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  operation: VisualCaptureOperation;
  root: string;
  argv: string[];
  storyIds: string[];
  browsers: VisualDeltaBrowser[];
  failureMode?: VisualTestFailureMode;
  mutationApproved: boolean;
};

export type VisualCaptureRunnerEvent =
  | { type: "start"; profile: VisualCaptureProfile }
  | { type: "log"; message: string }
  | { type: "done"; exitCode: number; profile: VisualCaptureProfile };

export type VisualCaptureRunnerContext = {
  signal?: AbortSignal;
  onEvent?: (event: VisualCaptureRunnerEvent) => void;
};

export type VisualCaptureRunnerResult = {
  exitCode: number;
  profile: VisualCaptureProfile;
  stagedArtifactRoot?: string;
  stagedArtifacts?: Array<{
    relativePath: string;
    sha256: string;
  }>;
};

export type VisualDeltaCaptureRunner = {
  id: string;
  kind: "docker" | "custom";
  profile: VisualCaptureProfile;
  run(
    manifest: VisualCaptureJobManifest,
    context: VisualCaptureRunnerContext,
  ): Promise<VisualCaptureRunnerResult>;
  doctor?(): Promise<{ ok: boolean; diagnostics: string[] }>;
};

export function defineVisualDeltaCaptureRunner<T extends VisualDeltaCaptureRunner>(
  runner: T,
): T {
  if (!runner?.id?.trim()) throw new Error("Capture runner id is required.");
  if (runner.kind !== "docker" && runner.kind !== "custom") {
    throw new Error('Capture runner kind must be "docker" or "custom".');
  }
  if (typeof runner.run !== "function") {
    throw new Error("Capture runner must provide run().");
  }
  return runner;
}

export type { VisualCaptureProfile } from "../shared/capture-profile.js";
