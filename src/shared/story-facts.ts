import type {
  VisualBaselineEnvironment,
  VisualDeltaBrowser,
} from "./environments.js";

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

export type VisualBrowserCoverage = {
  /** Canonical browser-only identity; browser remains a compatibility alias. */
  target?: import("./environments.js").VisualBaselineTarget;
  browser: VisualDeltaBrowser;
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
  /** Exact primary-baseline coverage for observed and required browsers (v4). */
  browserCoverage?: VisualBrowserCoverage[];
};

export type VisualStoryFactsRequest = {
  stories: VisualStoryDescriptor[];
};

export type VisualStoryFactsResponse = {
  ok: true;
  version: 1 | 2 | 3 | 4;
  generatedAt: number;
  stories: VisualStoryFact[];
  /** @deprecated Canonical Browser × OS pairs from version 3 responses. */
  availableEnvironments?: VisualBaselineEnvironment[];
  /** Configured browsers × discovered/runtime platforms required for parity (v3). */
  requiredEnvironments?: VisualBaselineEnvironment[];
  /** Canonical browser suffixes observed anywhere beneath snapshotDir (v4). */
  availableBrowsers?: VisualDeltaBrowser[];
  /** Configured browsers required for primary coverage (v4). */
  requiredBrowsers?: VisualDeltaBrowser[];
  /** Canonical capture provenance for v4 browser coverage. */
  captureProfile?: import("./capture-profile.js").VisualCaptureProfile;
};
