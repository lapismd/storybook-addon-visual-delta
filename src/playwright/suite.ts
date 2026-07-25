import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
} from "../shared/capture-params-attrs.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import {
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_UNTIL_PARAM,
  interactionScreenshotRelativePath,
} from "../shared/interaction-capture.js";
import type { BaselinePathMode } from "../node/options.js";
import {
  DEFAULT_BASELINE_PATH_MODE,
  DEFAULT_SNAPSHOT_DIR,
} from "../node/options.js";
import {
  screenshotRelativePath,
  type StoryIndexEntry,
} from "../node/snapshot-paths.js";

const PORTAL_SELECTORS = [
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[data-state="open"]',
].join(", ");

export type VisualSuiteOptions = {
  /** Project root (default: cwd). */
  packageRoot?: string;
  /** Snapshot directory relative to packageRoot or absolute. */
  snapshotDir?: string;
  baselinePathMode?: BaselinePathMode;
  /**
   * Optional filter — return false to skip a story (after skip-visual filter).
   */
  includeStory?: (entry: StoryIndexEntry) => boolean;
};

type InteractionCaptureRequest = {
  storyId: string;
  stepId: string;
  stepLabel?: string;
};

function resolveRoot(options: VisualSuiteOptions): string {
  return options.packageRoot?.trim() || process.cwd();
}

function resolveMode(options: VisualSuiteOptions): BaselinePathMode {
  const fromEnv = process.env.VISUAL_DELTA_BASELINE_PATH_MODE?.trim();
  if (fromEnv === "story-id" || fromEnv === "nested-import") return fromEnv;
  return options.baselinePathMode ?? DEFAULT_BASELINE_PATH_MODE;
}

function loadVisualStories(
  packageRoot: string,
  includeStory?: (entry: StoryIndexEntry) => boolean,
): StoryIndexEntry[] {
  const indexPath = path.join(packageRoot, "storybook-static", "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(
      `Missing ${indexPath} — run build-storybook before visual tests`,
    );
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    entries?: Record<string, StoryIndexEntry>;
  };
  return Object.values(index.entries ?? {}).filter((entry) => {
    if (entry.type && entry.type !== "story") return false;
    if ((entry.tags ?? []).includes("skip-visual")) return false;
    if (includeStory && !includeStory(entry)) return false;
    return true;
  });
}

async function portalUnionClip(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((portalSelector) => {
    const root = document.querySelector("#storybook-root");
    if (!root) return null;
    // Base on the story subject — not `#storybook-root`, which is often
    // `min-height: 100vh` and would explode the clip to the full viewport.
    const subject = root.querySelector(":scope > *") ?? root;
    const rects: DOMRect[] = [];
    for (const el of document.querySelectorAll(portalSelector)) {
      if (!(el instanceof HTMLElement)) continue;
      // Accordion/Collapsible mark open items with data-state=open inside root.
      if (root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      rects.push(r);
    }
    if (rects.length === 0) return null;
    rects.unshift(subject.getBoundingClientRect());
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const r of rects) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    const x = Math.max(0, Math.floor(left));
    const y = Math.max(0, Math.floor(top));
    const width = Math.ceil(right - left);
    const height = Math.ceil(bottom - top);
    if (width < 1 || height < 1) return null;
    return { x, y, width, height };
  }, PORTAL_SELECTORS);
}

async function prepareStoryPage(
  page: Page,
  storyId: string,
  options?: { visualCaptureUntil?: string },
): Promise<void> {
  const params = new URLSearchParams({
    id: storyId,
    viewMode: "story",
  });
  if (options?.visualCaptureUntil) {
    params.set(VISUAL_CAPTURE_UNTIL_PARAM, options.visualCaptureUntil);
  }
  await page.goto(`/iframe.html?${params.toString()}`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#storybook-root")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function settleAfterPlay(page: Page): Promise<void> {
  await page
    .waitForFunction(() => {
      return !document.querySelector(
        ".sb-show-preparing-story, .sb-show-preparing-docs",
      );
    }, undefined, { timeout: 5000 })
    .catch(() => undefined);

  const delayAttr = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_DELAY_ATTR);
  const delay = Number(delayAttr);
  if (Number.isFinite(delay) && delay > 0) {
    await page.waitForTimeout(delay);
  }
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

async function screenshotStorySubject(
  page: Page,
  name: string | string[],
): Promise<void> {
  const crop = await page.locator("html").getAttribute(VISUAL_DELTA_CROP_ATTR);
  const ignoreAttr = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST);
  const ignoreSelectors = resolveIgnoreSelectors(
    ignoreAttr ? ignoreAttr.split("\n").filter(Boolean) : [],
  );
  const masks = ignoreSelectors.map((sel) => page.locator(sel));

  const isBaselineUpdate = process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS === "1";
  const expectOpts = {
    animations: "disabled" as const,
    caret: "hide" as const,
    scale: "device" as const,
    ...(masks.length ? { mask: masks } : {}),
    ...(isBaselineUpdate ? { maxDiffPixelRatio: 0 } : {}),
  };

  if (crop === "1" || crop === "true") {
    await expect(page).toHaveScreenshot(name, {
      ...expectOpts,
      fullPage: false,
    });
    return;
  }

  const clip = await portalUnionClip(page);
  if (clip) {
    await expect(page).toHaveScreenshot(name, { ...expectOpts, clip });
    return;
  }

  const subject: Locator = page.locator("#storybook-root > *").first();
  if ((await subject.count()) > 0) {
    await expect(subject).toHaveScreenshot(name, expectOpts);
    return;
  }
  await expect(page).toHaveScreenshot(name, {
    ...expectOpts,
    fullPage: false,
  });
}

/**
 * Register a portable Visual Delta Playwright suite.
 *
 * Host entry:
 * ```ts
 * import { defineVisualSuite } from "storybook-addon-visual-delta/playwright";
 * defineVisualSuite();
 * ```
 *
 * Honors `PLAYWRIGHT_INTERACTION_CAPTURE` for the packaged `visual-delta
 * interaction-update` CLI, and `VISUAL_DELTA_BASELINE_PATH_MODE` /
 * `VISUAL_DELTA_SNAPSHOT_DIR` from that CLI.
 */
export function defineVisualSuite(options: VisualSuiteOptions = {}): void {
  const packageRoot = resolveRoot(options);
  const mode = resolveMode(options);
  const stories = loadVisualStories(packageRoot, options.includeStory);

  const interactionEnv = process.env.PLAYWRIGHT_INTERACTION_CAPTURE?.trim();
  const interactionRequest: InteractionCaptureRequest | null = interactionEnv
    ? (JSON.parse(interactionEnv) as InteractionCaptureRequest)
    : null;

  if (interactionRequest) {
    const entry = stories.find((s) => s.id === interactionRequest.storyId);
    test(`interaction ${interactionRequest.storyId} / ${interactionRequest.stepId}`, async ({
      page,
    }) => {
      if (!entry) {
        throw new Error(
          `Story not found or skip-visual: ${interactionRequest.storyId}`,
        );
      }
      await prepareStoryPage(page, entry.id, {
        visualCaptureUntil: interactionRequest.stepId,
      });
      await page
        .locator(`html[${VISUAL_CAPTURE_READY_ATTR}="${interactionRequest.stepId}"]`)
        .waitFor({ timeout: 15_000 });
      await settleAfterPlay(page);
      const rel = interactionScreenshotRelativePath(
        screenshotRelativePath(entry, mode),
        interactionRequest.stepId,
      );
      await screenshotStorySubject(page, rel.split("/"));
    });
    return;
  }

  for (const story of stories) {
    test(story.id, async ({ page }) => {
      await prepareStoryPage(page, story.id);
      await settleAfterPlay(page);
      const rel = screenshotRelativePath(story, mode);
      await screenshotStorySubject(page, rel.split("/"));
    });
  }
}

/** Re-export for hosts that want the default snapshot dir constant. */
export { DEFAULT_SNAPSHOT_DIR };
