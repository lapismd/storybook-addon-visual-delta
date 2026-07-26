import { createRequire } from "node:module";
import type * as PlaywrightTest from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
  VISUAL_DELTA_MODES_ATTR,
} from "../shared/capture-params-attrs.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import type { VisualDeltaModeDef, VisualDeltaModes } from "../shared/modes.js";
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
import {
  baselinePngAbs,
  writeDiffArtifactsForBaseline,
} from "./write-diff-artifacts.js";
import {
  settleVisualStoryPage,
  waitForVisualStoryFinished,
} from "./readiness.js";

const requireFromHost = createRequire(path.join(process.cwd(), "package.json"));

function loadHostPlaywrightTest(): typeof PlaywrightTest {
  return requireFromHost("@playwright/test") as typeof PlaywrightTest;
}

function serializeGlobals(globals: Record<string, unknown>): string {
  const router = requireFromHost("storybook/internal/router") as {
    buildArgsParam: (
      initial: Record<string, unknown>,
      next: Record<string, unknown>,
    ) => string;
  };
  return router.buildArgsParam({}, globals);
}

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

function resolveSnapshotDirRel(options: VisualSuiteOptions): string {
  const fromEnv = process.env.VISUAL_DELTA_SNAPSHOT_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? path.relative(resolveRoot(options), fromEnv) || DEFAULT_SNAPSHOT_DIR
      : fromEnv;
  }
  if (options.snapshotDir?.trim()) {
    const dir = options.snapshotDir.trim();
    return path.isAbsolute(dir)
      ? path.relative(resolveRoot(options), dir) || DEFAULT_SNAPSHOT_DIR
      : dir;
  }
  return DEFAULT_SNAPSHOT_DIR;
}

type ShotTarget = {
  subject: Locator | null;
  clip: { x: number; y: number; width: number; height: number } | null;
  fullViewport: boolean;
};

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
  options?: {
    visualCaptureUntil?: string;
    globals?: Record<string, unknown>;
  },
): Promise<void> {
  const { expect } = loadHostPlaywrightTest();
  const params = new URLSearchParams({
    id: storyId,
    viewMode: "story",
  });
  if (options?.visualCaptureUntil) {
    params.set(VISUAL_CAPTURE_UNTIL_PARAM, options.visualCaptureUntil);
  }
  if (options?.globals && Object.keys(options.globals).length > 0) {
    params.set("globals", serializeGlobals(options.globals));
  }
  await page.goto(`/iframe.html?${params.toString()}`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#storybook-root")).toBeVisible();
  if (!options?.visualCaptureUntil) {
    await waitForVisualStoryFinished(page, storyId);
    await settleVisualStoryPage(page);
  }
}

async function readVisualModes(page: Page): Promise<VisualDeltaModes> {
  const raw = await page.locator("html").getAttribute(VISUAL_DELTA_MODES_ATTR);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as VisualDeltaModes;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          !(value as VisualDeltaModeDef).disable,
      ),
    );
  } catch {
    return {};
  }
}

async function screenshotStorySubject(
  page: Page,
  name: string | string[],
): Promise<ShotTarget> {
  const { expect } = loadHostPlaywrightTest();
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
    return { subject: null, clip: null, fullViewport: true };
  }

  const clip = await portalUnionClip(page);
  if (clip) {
    await expect(page).toHaveScreenshot(name, { ...expectOpts, clip });
    return { subject: null, clip, fullViewport: false };
  }

  const subject: Locator = page.locator("#storybook-root > *").first();
  if ((await subject.count()) > 0) {
    await expect(subject).toHaveScreenshot(name, expectOpts);
    return { subject, clip: null, fullViewport: false };
  }
  await expect(page).toHaveScreenshot(name, {
    ...expectOpts,
    fullPage: false,
  });
  return { subject: null, clip: null, fullViewport: true };
}

async function captureActualPng(
  page: Page,
  target: ShotTarget,
): Promise<Buffer> {
  const shotOpts = {
    animations: "disabled" as const,
    caret: "hide" as const,
    scale: "device" as const,
    type: "png" as const,
  };
  if (target.fullViewport) {
    return page.screenshot({ ...shotOpts, fullPage: false });
  }
  if (target.clip) {
    return page.screenshot({ ...shotOpts, clip: target.clip });
  }
  if (target.subject) {
    return target.subject.screenshot(shotOpts);
  }
  return page.screenshot({ ...shotOpts, fullPage: false });
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
  const { test } = loadHostPlaywrightTest();
  const packageRoot = resolveRoot(options);
  const mode = resolveMode(options);
  const snapshotDir = resolveSnapshotDirRel(options);
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
        .locator(
          `html[${VISUAL_CAPTURE_READY_ATTR}="${interactionRequest.stepId}"]`,
        )
        .waitFor({ timeout: 15_000 });
      await settleVisualStoryPage(page);
      const rel = interactionScreenshotRelativePath(
        screenshotRelativePath(entry, mode),
        interactionRequest.stepId,
      );
      let target: ShotTarget = {
        subject: null,
        clip: null,
        fullViewport: false,
      };
      let status: "passed" | "failed" = "passed";
      let error: string | undefined;
      try {
        target = await screenshotStorySubject(page, rel.split("/"));
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const actualPng = await captureActualPng(page, target).catch(
          () => null,
        );
        // `{slug}--{stepId}-chromium-darwin.png` beside the primary baseline.
        const baselinePngAbsPath = baselinePngAbs(
          entry,
          packageRoot,
          snapshotDir,
          mode,
        ).replace(
          /-chromium-([a-z0-9]+)\.png$/i,
          `--${interactionRequest.stepId}-chromium-$1.png`,
        );
        writeDiffArtifactsForBaseline({
          entry,
          packageRoot,
          snapshotDir,
          mode,
          baselinePngAbsPath,
          status,
          error,
          actualPng,
          viewport: page.viewportSize() ?? undefined,
          deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
        });
      }
    });
    return;
  }

  for (const story of stories) {
    test(story.id, async ({ page }) => {
      await prepareStoryPage(page, story.id);
      const visualModes = await readVisualModes(page);
      const captures: Array<{
        name: string;
        modeName?: string;
        globals?: Record<string, unknown>;
      }> = [
        { name: "Default" },
        ...Object.entries(visualModes).map(([modeName, definition]) => ({
          name: modeName,
          modeName,
          globals: definition.globals,
        })),
      ];
      const failures: string[] = [];

      for (const capture of captures) {
        await test.step(`Visual mode: ${capture.name}`, async () => {
          if (capture.modeName) {
            await prepareStoryPage(page, story.id, {
              globals: capture.globals,
            });
          }
          const rel = screenshotRelativePath(story, mode, capture.modeName);
          let target: ShotTarget = {
            subject: null,
            clip: null,
            fullViewport: false,
          };
          let status: "passed" | "failed" = "passed";
          let error: string | undefined;
          try {
            target = await screenshotStorySubject(page, rel.split("/"));
          } catch (err) {
            status = "failed";
            error = err instanceof Error ? err.message : String(err);
            failures.push(`${capture.name}: ${error}`);
          } finally {
            const actualPng = await captureActualPng(page, target).catch(
              () => null,
            );
            writeDiffArtifactsForBaseline({
              entry: story,
              packageRoot,
              snapshotDir,
              mode,
              baselinePngAbsPath: baselinePngAbs(
                story,
                packageRoot,
                snapshotDir,
                mode,
                "chromium",
                process.platform,
                capture.modeName,
              ),
              status,
              error,
              actualPng,
              visualModeName: capture.modeName,
              viewport: page.viewportSize() ?? undefined,
              deviceScaleFactor: await page.evaluate(
                () => window.devicePixelRatio,
              ),
            });
          }
        });
      }

      if (failures.length > 0) {
        throw new Error(
          `Visual comparison failed in ${failures.length} mode${
            failures.length === 1 ? "" : "s"
          }:\n${failures.join("\n")}`,
        );
      }
    });
  }
}

/** Re-export for hosts that want the default snapshot dir constant. */
export { DEFAULT_SNAPSHOT_DIR };
