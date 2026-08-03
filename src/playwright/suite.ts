import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type * as PlaywrightTest from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  VISUAL_DELTA_ALIGN_ATTR,
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_DIFF_THRESHOLD_ATTR,
  VISUAL_DELTA_INCLUDE_AA_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
  VISUAL_DELTA_MODES_ATTR,
  VISUAL_DELTA_PASS_THRESHOLD_ATTR,
} from "../shared/capture-params-attrs.js";
import {
  VISUAL_CAPTURE_SURFACE_SELECTORS,
  measureVisualCaptureClip,
} from "../shared/capture-target.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import type { VisualDeltaModeDef, VisualDeltaModes } from "../shared/modes.js";
import {
  VISUAL_CAPTURE_CALL_PARAM,
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_UNTIL_PARAM,
  interactionScreenshotRelativePath,
} from "../shared/interaction-capture.js";
import type { BaselinePathMode } from "../node/options.js";
import {
  DEFAULT_BASELINE_PATH_MODE,
  DEFAULT_SNAPSHOT_DIR,
} from "../node/options.js";
import { readVisualDeltaProjectConfig } from "../node/project-config.js";
import type { VisualDeltaProjectDefaults } from "../shared/config-types.js";
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
import {
  isVisualDeltaBrowser,
  type VisualDeltaBrowser,
} from "../shared/environments.js";
import {
  isVisualTestFailureMode,
  isWarningComparisonOutcome,
  resolveVisualTestFailureMode,
} from "../shared/failure-mode.js";
import { visualRenderFingerprints } from "../node/affected-visual-tests.js";
import type { VisualCaptureSetItem } from "../visual-diff-sidecar.js";

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
  captureCallId?: string;
};

function browserForTest(testInfo: TestInfo): VisualDeltaBrowser {
  const name = testInfo.project.name;
  if (!isVisualDeltaBrowser(name)) {
    throw new Error(
      `Unsupported Visual Delta Playwright project ${JSON.stringify(name)}; use chromium, firefox, or webkit.`,
    );
  }
  return name;
}

function comparisonMessage(
  label: string,
  sidecar: ReturnType<typeof writeDiffArtifactsForBaseline>,
): string {
  return `${label}: ${
    sidecar.error ??
    `Visual comparison outcome: ${sidecar.outcome ?? "mismatch"}`
  }`;
}

function applyFailurePolicy(options: {
  label: string;
  sidecar: ReturnType<typeof writeDiffArtifactsForBaseline>;
  testInfo: TestInfo;
  failureMode: "warn" | "strict";
  failures: string[];
}): void {
  if (options.sidecar.passed) return;
  const message = comparisonMessage(options.label, options.sidecar);
  if (
    options.failureMode === "warn" &&
    isWarningComparisonOutcome(options.sidecar.outcome)
  ) {
    options.testInfo.annotations.push({
      type: "visual-warning",
      description: message,
    });
    console.warn(`[visual-delta] ${message}`);
    return;
  }
  options.failures.push(message);
}

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

function resolveBaselineOverride(options: VisualSuiteOptions): string | null {
  const relative = process.env.VISUAL_DELTA_BASELINE_OVERRIDE?.trim();
  if (!relative) return null;
  const normalized = relative.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    !normalized.toLowerCase().endsWith(".png") ||
    /\.(?:actual|diff)\.png$/i.test(normalized)
  ) {
    throw new Error(`Invalid VISUAL_DELTA_BASELINE_OVERRIDE: ${relative}`);
  }
  const root = resolveRoot(options);
  const snapshotRoot = path.resolve(root, resolveSnapshotDirRel(options));
  const absolute = path.resolve(snapshotRoot, ...normalized.split("/"));
  if (
    absolute !== snapshotRoot &&
    !absolute.startsWith(`${snapshotRoot}${path.sep}`)
  ) {
    throw new Error(`VISUAL_DELTA_BASELINE_OVERRIDE escapes snapshotDir: ${relative}`);
  }
  return absolute;
}

type ShotTarget = {
  subject: Locator | null;
  clip: { x: number; y: number; width: number; height: number } | null;
  fullViewport: boolean;
  captureConfig: {
    cropToViewport: boolean;
    ignoreSelectors: string[];
    passThresholdPercent: number;
    diffThreshold: number;
    includeAntiAliasing: boolean;
    delay: number;
    align: "viewport" | "canvas";
  };
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

async function prepareStoryPage(
  page: Page,
  storyId: string,
  options?: {
    visualCaptureUntil?: string;
    visualCaptureCallId?: string;
    globals?: Record<string, unknown>;
    projectDefaultDelay?: number;
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
  if (options?.visualCaptureCallId) {
    params.set(VISUAL_CAPTURE_CALL_PARAM, options.visualCaptureCallId);
    params.set("instrument", "true");
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
    const delayRaw = await page
      .locator("html")
      .getAttribute(VISUAL_DELTA_DELAY_ATTR);
    await settleVisualStoryPage(page, {
      delay: delayRaw ? Number(delayRaw) : (options?.projectDefaultDelay ?? 0),
    });
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
  defaults: VisualDeltaProjectDefaults,
  target: ShotTarget,
): Promise<ShotTarget> {
  const { expect } = loadHostPlaywrightTest();
  const crop = await page.locator("html").getAttribute(VISUAL_DELTA_CROP_ATTR);
  const ignoreAttr = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST);
  const ignoreSelectors = resolveIgnoreSelectors(
    ignoreAttr ? ignoreAttr.split("\n").filter(Boolean) : [],
  );
  const passRaw = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_PASS_THRESHOLD_ATTR);
  const diffRaw = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_DIFF_THRESHOLD_ATTR);
  const includeAaRaw = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_INCLUDE_AA_ATTR);
  const delayRaw = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_DELAY_ATTR);
  const alignRaw = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_ALIGN_ATTR);
  const passThresholdPercent = passRaw
    ? Number(passRaw)
    : defaults.passThresholdPercent;
  const diffThreshold = diffRaw ? Number(diffRaw) : defaults.diffThreshold;
  const includeAntiAliasing =
    includeAaRaw == null
      ? defaults.diffIncludeAntiAliasing
      : includeAaRaw === "1" || includeAaRaw === "true";
  const cropToViewport =
    crop == null ? defaults.cropToViewport : crop === "1" || crop === "true";
  const captureConfig = {
    cropToViewport,
    ignoreSelectors,
    passThresholdPercent,
    diffThreshold,
    includeAntiAliasing,
    delay: delayRaw ? Number(delayRaw) : defaults.delay,
    align: alignRaw === "canvas" ? ("canvas" as const) : ("viewport" as const),
  };
  const masks = ignoreSelectors.map((sel) => page.locator(sel));

  const isBaselineUpdate = process.env.PLAYWRIGHT_UPDATE_SNAPSHOTS === "1";
  const expectOpts = {
    animations: "disabled" as const,
    caret: "hide" as const,
    scale: "device" as const,
    threshold: diffThreshold,
    ...(masks.length ? { mask: masks } : {}),
    ...(isBaselineUpdate
      ? { maxDiffPixelRatio: 0 }
      : Number.isFinite(passThresholdPercent)
        ? { maxDiffPixelRatio: passThresholdPercent! / 100 }
        : {}),
  };

  if (cropToViewport) {
    Object.assign(target, {
      subject: null,
      clip: null,
      fullViewport: true,
      captureConfig,
    });
    await expect(page).toHaveScreenshot(name, {
      ...expectOpts,
      fullPage: false,
    });
    return target;
  }

  const clip = await page.evaluate(
    measureVisualCaptureClip,
    VISUAL_CAPTURE_SURFACE_SELECTORS,
  );
  if (clip) {
    Object.assign(target, {
      subject: null,
      clip,
      fullViewport: false,
      captureConfig,
    });
    await expect(page).toHaveScreenshot(name, { ...expectOpts, clip });
    return target;
  }

  const subject: Locator = page.locator("#storybook-root > *").first();
  if ((await subject.count()) > 0) {
    Object.assign(target, {
      subject,
      clip: null,
      fullViewport: false,
      captureConfig,
    });
    await expect(subject).toHaveScreenshot(name, expectOpts);
    return target;
  }
  Object.assign(target, {
    subject: null,
    clip: null,
    fullViewport: true,
    captureConfig,
  });
  await expect(page).toHaveScreenshot(name, {
    ...expectOpts,
    fullPage: false,
  });
  return target;
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
 * import { defineVisualSuite } from "@lapismd/storybook-addon-visual-delta/playwright";
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
  const projectConfig = readVisualDeltaProjectConfig(packageRoot);
  const configErrors = projectConfig.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configErrors.length > 0) {
    throw new Error(configErrors.map((diagnostic) => diagnostic.message).join(" "));
  }
  const projectDefaults = projectConfig.defaults;
  if (
    process.env.VISUAL_DELTA_FAILURE_MODE != null &&
    !isVisualTestFailureMode(process.env.VISUAL_DELTA_FAILURE_MODE)
  ) {
    throw new Error('VISUAL_DELTA_FAILURE_MODE must be "warn" or "strict".');
  }
  const failureMode = resolveVisualTestFailureMode({
    environment: process.env.VISUAL_DELTA_FAILURE_MODE,
    configured: projectConfig.workflow.visualTestFailureMode,
  });
  const mode = resolveMode(options);
  const snapshotDir = resolveSnapshotDirRel(options);
  const baselineOverride = resolveBaselineOverride(options);
  const stories = loadVisualStories(packageRoot, options.includeStory);
  const renderFingerprints = visualRenderFingerprints(packageRoot, {
    snapshotDir,
    baselinePathMode: mode,
  });

  const interactionEnv = process.env.PLAYWRIGHT_INTERACTION_CAPTURE?.trim();
  const interactionRequest: InteractionCaptureRequest | null = interactionEnv
    ? (JSON.parse(interactionEnv) as InteractionCaptureRequest)
    : null;

  if (interactionRequest) {
    const entry = stories.find((s) => s.id === interactionRequest.storyId);
    test(`interaction ${interactionRequest.storyId} / ${interactionRequest.stepId}`, async ({
      page,
    }, testInfo) => {
      const browser = browserForTest(testInfo);
      const captureOperationId = randomUUID();
      if (!entry) {
        throw new Error(
          `Story not found or skip-visual: ${interactionRequest.storyId}`,
        );
      }
      await prepareStoryPage(page, entry.id, {
        visualCaptureUntil: interactionRequest.stepId,
        visualCaptureCallId: interactionRequest.captureCallId,
        projectDefaultDelay: projectDefaults.delay,
      });
      await page
        .locator(
          `html[${VISUAL_CAPTURE_READY_ATTR}="${interactionRequest.stepId}"]`,
        )
        .waitFor({ timeout: 15_000 });
      const interactionDelayRaw = await page
        .locator("html")
        .getAttribute(VISUAL_DELTA_DELAY_ATTR);
      await settleVisualStoryPage(page, {
        delay: interactionDelayRaw
          ? Number(interactionDelayRaw)
          : projectDefaults.delay,
      });
      const rel = interactionScreenshotRelativePath(
        screenshotRelativePath(entry, mode),
        interactionRequest.stepId,
      );
      let target: ShotTarget = {
        subject: null,
        clip: null,
        fullViewport: false,
        captureConfig: {
          cropToViewport: projectDefaults.cropToViewport,
          ignoreSelectors: [],
          passThresholdPercent: projectDefaults.passThresholdPercent,
          diffThreshold: projectDefaults.diffThreshold,
          includeAntiAliasing: projectDefaults.diffIncludeAntiAliasing,
          delay: projectDefaults.delay,
          align: "viewport",
        },
      };
      let status: "passed" | "failed" = "passed";
      let error: string | undefined;
      const failures: string[] = [];
      try {
        target = await screenshotStorySubject(
          page,
          rel.split("/"),
          projectDefaults,
          target,
        );
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
      } finally {
        const actualPng = await captureActualPng(page, target).catch(
          () => null,
        );
        // `{slug}--{stepId}-{browser}.png` beside the primary baseline.
        const baselinePngAbsPath = baselineOverride ?? baselinePngAbs(
          entry,
          packageRoot,
          snapshotDir,
          mode,
          browser,
        ).replace(
          `-${browser}.png`,
          `--${interactionRequest.stepId}-${browser}.png`,
        );
        const sidecar = writeDiffArtifactsForBaseline({
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
          passThresholdPercent: target.captureConfig.passThresholdPercent,
          diffThreshold: target.captureConfig.diffThreshold,
          includeAntiAliasing: target.captureConfig.includeAntiAliasing,
          captureConfig: target.captureConfig,
          browser,
          failureMode,
          variant: { kind: "interaction", id: interactionRequest.stepId },
          renderFingerprint: renderFingerprints[entry.id],
          operationId: captureOperationId,
          captureOperationId,
        });
        applyFailurePolicy({
          label: "Interaction",
          sidecar,
          testInfo,
          failureMode,
          failures,
        });
      }
      if (failures.length > 0) throw new Error(failures.join("\n"));
    });
    return;
  }

  for (const story of stories) {
    test(story.id, async ({ page }, testInfo) => {
      const browser = browserForTest(testInfo);
      const captureOperationId = randomUUID();
      await prepareStoryPage(page, story.id, {
        projectDefaultDelay: projectDefaults.delay,
      });
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
      const snapshotRoot = path.resolve(packageRoot, snapshotDir);
      const captureSet: VisualCaptureSetItem[] = captures.map((capture) => {
        const baselinePath =
          !capture.modeName && baselineOverride
            ? baselineOverride
            : baselinePngAbs(
                story,
                packageRoot,
                snapshotDir,
                mode,
                browser,
                capture.modeName,
              );
        return {
          variant: capture.modeName
            ? { kind: "mode", id: capture.modeName }
            : { kind: "primary" },
          baselineRelative: path
            .relative(snapshotRoot, baselinePath)
            .replaceAll(path.sep, "/"),
        };
      });

      for (const capture of captures) {
        await test.step(`Visual mode: ${capture.name}`, async () => {
          if (capture.modeName) {
            await prepareStoryPage(page, story.id, {
              globals: capture.globals,
              projectDefaultDelay: projectDefaults.delay,
            });
          }
          const rel = screenshotRelativePath(story, mode, capture.modeName);
          let target: ShotTarget = {
            subject: null,
            clip: null,
            fullViewport: false,
            captureConfig: {
              cropToViewport: projectDefaults.cropToViewport,
              ignoreSelectors: [],
              passThresholdPercent: projectDefaults.passThresholdPercent,
              diffThreshold: projectDefaults.diffThreshold,
              includeAntiAliasing: projectDefaults.diffIncludeAntiAliasing,
              delay: projectDefaults.delay,
              align: "viewport",
            },
          };
          let status: "passed" | "failed" = "passed";
          let error: string | undefined;
          try {
            target = await screenshotStorySubject(
              page,
              rel.split("/"),
              projectDefaults,
              target,
            );
          } catch (err) {
            status = "failed";
            error = err instanceof Error ? err.message : String(err);
          } finally {
            const actualPng = await captureActualPng(page, target).catch(
              () => null,
            );
            const sidecar = writeDiffArtifactsForBaseline({
              entry: story,
              packageRoot,
              snapshotDir,
              mode,
              baselinePngAbsPath:
                !capture.modeName && baselineOverride
                  ? baselineOverride
                  : baselinePngAbs(
                      story,
                      packageRoot,
                      snapshotDir,
                      mode,
                      browser,
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
              passThresholdPercent: target.captureConfig.passThresholdPercent,
              diffThreshold: target.captureConfig.diffThreshold,
              includeAntiAliasing: target.captureConfig.includeAntiAliasing,
              captureConfig: {
                ...target.captureConfig,
                mode: capture.modeName ?? null,
                globals: capture.globals ?? null,
              },
              browser,
              failureMode,
              variant: capture.modeName
                ? { kind: "mode", id: capture.modeName }
                : { kind: "primary" },
              captureSet,
              renderFingerprint: renderFingerprints[story.id],
              operationId: captureOperationId,
              captureOperationId,
            });
            applyFailurePolicy({
              label: capture.name,
              sidecar,
              testInfo,
              failureMode,
              failures,
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
