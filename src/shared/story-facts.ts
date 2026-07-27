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

export type VisualStoryFact = {
  storyId: string;
  baseline: VisualBaselineCoverage;
  /** Current PNG revision and matching persisted result evidence (v2). */
  baselineHash?: string;
  resultBaselineHash?: string;
  resultCaptureConfigHash?: string;
};

export type VisualStoryFactsRequest = {
  stories: VisualStoryDescriptor[];
};

export type VisualStoryFactsResponse = {
  ok: true;
  version: 1 | 2;
  generatedAt: number;
  stories: VisualStoryFact[];
};
