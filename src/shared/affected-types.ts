/** How a visual run selected its Storybook stories. */
export type VisualRunSelectionMode = "affected" | "all" | "selected";

/** Serializable affected-selection details shared by CLI, middleware, and UI. */
export type AffectedVisualSummary = {
  selection: VisualRunSelectionMode;
  /** Stories Playwright will exercise. */
  selected: number;
  /** Runnable stories whose last passing fingerprint still matches. */
  unchanged: number;
  /** Total runnable stories, excluding `skip-visual`. */
  total: number;
  /** True when affected mode can return successfully without Playwright. */
  noChange: boolean;
  /** Conservative reason affected mode broadened to the complete suite. */
  fallbackReason?: string;
  /** Inputs whose content or presence changed since the cached graph. */
  changedInputs?: string[];
  /** Exact selected story ids (omitted from compact status displays). */
  storyIds?: string[];
};

/** Global Testing Module scope-resolution request. */
export type VisualActionScopeRequest = {
  /** Leaf story ids visible in the filtered Storybook sidebar at invocation. */
  visibleStoryIds: string[];
  /** Intersect visible ids with a refreshed affected plan. */
  affectedOnly: boolean;
};

/** Frozen exact ids reused by every enabled Testing Module action. */
export type VisualActionScopeResponse = {
  ok: true;
  storyIds: string[];
  summary: AffectedVisualSummary;
  /** True when the preflight rebuilt Storybook before freezing the ids. */
  rebuilt: boolean;
};
