import type { VisualBaselineEnvironment } from "./environments.js";

export type VisualStoryDescriptor = {
  id: string;
  type?: string;
  title?: string;
  name?: string;
  importPath?: string;
  exportName?: string;
  tags?: string[];
};

export type VisualBaselineCoverage = "present" | "missing" | "unresolved";

export type VisualEnvironmentCoverage = VisualBaselineEnvironment & {
  baseline: VisualBaselineCoverage;
};

export type VisualStoryFact = {
  storyId: string;
  baseline: VisualBaselineCoverage;
  /** Current PNG revision and matching persisted result evidence (v2). */
  baselineHash?: string;
  resultBaselineHash?: string;
  resultCaptureConfigHash?: string;
  /** Exact primary-baseline coverage for observed and required environments. */
  environmentCoverage?: VisualEnvironmentCoverage[];
};

export type VisualStoryFactsRequest = {
  stories: VisualStoryDescriptor[];
};

export type VisualStoryFactsResponse = {
  ok: true;
  version: 1 | 2 | 3;
  generatedAt: number;
  stories: VisualStoryFact[];
  /** Canonical Browser × OS pairs observed anywhere beneath snapshotDir (v3). */
  availableEnvironments?: VisualBaselineEnvironment[];
  /** Configured browsers × discovered/runtime platforms required for parity (v3). */
  requiredEnvironments?: VisualBaselineEnvironment[];
};
