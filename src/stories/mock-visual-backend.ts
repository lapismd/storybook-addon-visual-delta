/**
 * In-memory stand-in for `/__visual-delta/*` so Panel Shell stories can
 * exercise create/update/run/review without Playwright or CSF writes.
 */

export type MockVisualAction =
  | "create-baseline"
  | "update-baseline"
  | "create-interaction"
  | "run-tests"
  | "cancel-tests"
  | "review-status"
  | "skip-visual"
  | "diff";

export type MockVisualBackend = {
  actions: MockVisualAction[];
  lastReviewStatus: "pending" | "approved" | "ready" | "failed" | null;
  lastSkipVisual: boolean | null;
  lastInteractionStep: string | null;
  cancelled: boolean;
  reset: () => void;
  createBaseline: (storyId: string) => Promise<string>;
  updateBaseline: (storyId: string) => Promise<string>;
  createInteraction: (args: {
    storyId: string;
    stepLabel: string;
    stepId?: string;
  }) => Promise<string>;
  runTests: (storyIds?: string[]) => AsyncGenerator<string, void, unknown>;
  cancelTests: () => Promise<void>;
  reviewStatus: (
    storyId: string,
    status: "pending" | "approved" | "ready" | "failed",
  ) => Promise<{ ok: boolean; status: string }>;
  skipVisual: (
    storyId: string,
    skip: boolean,
  ) => Promise<{ ok: boolean; skip: boolean }>;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockVisualBackend(): MockVisualBackend {
  const actions: MockVisualAction[] = [];
  let cancelled = false;
  let lastReviewStatus: MockVisualBackend["lastReviewStatus"] = null;
  let lastSkipVisual: boolean | null = null;
  let lastInteractionStep: string | null = null;
  let runActive = false;

  return {
    get actions() {
      return actions;
    },
    get lastReviewStatus() {
      return lastReviewStatus;
    },
    get lastSkipVisual() {
      return lastSkipVisual;
    },
    get lastInteractionStep() {
      return lastInteractionStep;
    },
    get cancelled() {
      return cancelled;
    },
    reset() {
      actions.length = 0;
      cancelled = false;
      lastReviewStatus = null;
      lastSkipVisual = null;
      lastInteractionStep = null;
      runActive = false;
    },
    async createBaseline(storyId) {
      actions.push("create-baseline");
      await delay(40);
      return `Created baseline for ${storyId}\n[exit 0]\n`;
    },
    async updateBaseline(storyId) {
      actions.push("update-baseline");
      await delay(40);
      return `Updated baseline for ${storyId}\n[exit 0]\n`;
    },
    async createInteraction({ storyId, stepLabel, stepId }) {
      actions.push("create-interaction");
      lastInteractionStep = stepId ?? stepLabel;
      await delay(40);
      return `Created interaction "${stepLabel}" for ${storyId}\n[exit 0]\n`;
    },
    async *runTests(storyIds) {
      actions.push("run-tests");
      cancelled = false;
      runActive = true;
      const ids = storyIds?.length ? storyIds : ["demo-story--default"];
      yield `${JSON.stringify({ type: "start", total: ids.length })}\n`;
      // Long enough for Panel Shell play to click Stop between chunks.
      await delay(200);
      if (cancelled) {
        runActive = false;
        yield `${JSON.stringify({
          type: "done",
          ok: false,
          exitCode: 1,
          rebuild: false,
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          logTail: "cancelled",
        })}\n`;
        return;
      }
      for (let i = 0; i < ids.length; i++) {
        if (cancelled) break;
        yield `${JSON.stringify({
          type: "progress",
          completed: i + 1,
          total: ids.length,
          passed: i + 1,
          failed: 0,
          storyId: ids[i],
          status: "passed",
        })}\n`;
        await delay(20);
      }
      runActive = false;
      yield `${JSON.stringify({
        type: "done",
        ok: !cancelled,
        exitCode: cancelled ? 1 : 0,
        rebuild: false,
        summary: {
          total: ids.length,
          passed: cancelled ? 0 : ids.length,
          failed: 0,
          skipped: 0,
        },
        results: ids.map((storyId) => ({
          storyId,
          status: "passed",
          title: storyId,
        })),
        logTail: cancelled ? "cancelled" : "ok",
      })}\n`;
    },
    async cancelTests() {
      actions.push("cancel-tests");
      cancelled = true;
      runActive = false;
    },
    async reviewStatus(_storyId, status) {
      actions.push("review-status");
      lastReviewStatus = status;
      await delay(20);
      return { ok: true, status };
    },
    async skipVisual(_storyId, skip) {
      actions.push("skip-visual");
      lastSkipVisual = skip;
      await delay(20);
      return { ok: true, skip };
    },
  };
}
