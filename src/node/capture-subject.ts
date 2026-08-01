import type { Browser, Page } from "playwright";
import { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT } from "../constants.js";
import {
  VISUAL_CAPTURE_CALL_PARAM,
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_UNTIL_PARAM,
} from "../shared/interaction-capture.js";
import {
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
} from "../shared/capture-params-attrs.js";
import {
  settleVisualStoryPage,
  waitForVisualStoryFinished,
} from "../playwright/readiness.js";
import {
  VISUAL_CAPTURE_SURFACE_SELECTORS,
  measureVisualCaptureClip,
} from "../shared/capture-target.js";
import type {
  CaptureSubjectPhase,
  CaptureSubjectProgress,
  CaptureSubjectResult,
} from "../shared/capture-subject-types.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import {
  isVisualDeltaBrowser,
  visualDeltaBrowserLabel,
  type VisualDeltaBrowser,
} from "../shared/environments.js";

export type {
  CaptureSubjectPhase,
  CaptureSubjectProgress,
  CaptureSubjectResult,
  CaptureSubjectStreamEvent,
} from "../shared/capture-subject-types.js";

export type CaptureSubjectRequest = {
  /** Absolute Storybook origin, e.g. http://localhost:9009 */
  origin: string;
  storyId: string;
  /** Park play after this step id (interaction baselines). */
  visualCaptureUntil?: string;
  /** Replay through this exact Storybook instrumenter call before capture. */
  visualCaptureCallId?: string;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  /** Extra settle delay (ms) after play (CSF `delay`). */
  delay?: number;
  /** CSS selectors to mask (Playwright `mask`). */
  ignoreSelectors?: string[];
  /** Capture full viewport instead of subject clip. */
  cropToViewport?: boolean;
  /** Storybook `globals` query serialization for mode captures. */
  globals?: string;
  browser?: VisualDeltaBrowser;
};

export type CaptureSubjectError = {
  ok: false;
  error: string;
};

const sharedBrowsers = new Map<VisualDeltaBrowser, Browser>();
let browserIdleTimer: ReturnType<typeof setTimeout> | null = null;
const BROWSER_IDLE_MS = 60_000;

const PHASE_LABELS: Record<CaptureSubjectPhase, string> = {
  launching: "Launching browser…",
  navigating: "Loading story…",
  settling: "Waiting for play…",
  capturing: "Capturing…",
  encoding: "Encoding…",
};

function scheduleBrowserClose() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => {
    browserIdleTimer = null;
    const browsers = [...sharedBrowsers.values()];
    sharedBrowsers.clear();
    for (const browser of browsers) {
      void browser.close().catch(() => {
        /* ignore */
      });
    }
  }, BROWSER_IDLE_MS);
}

async function getBrowser(
  browserName: VisualDeltaBrowser,
  onProgress?: (progress: CaptureSubjectProgress) => void,
): Promise<Browser> {
  const sharedBrowser = sharedBrowsers.get(browserName);
  if (sharedBrowser) {
    scheduleBrowserClose();
    return sharedBrowser;
  }
  onProgress?.({
    phase: "launching",
    label: `Launching ${visualDeltaBrowserLabel(browserName)}…`,
  });
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is required for browser diff. Install `playwright` in the host project.",
    );
  }
  let launched: Browser;
  try {
    launched = await playwright[browserName].launch({ headless: true });
  } catch (error) {
    throw new Error(
      `Could not launch ${visualDeltaBrowserLabel(browserName)}. Run \`pnpm exec playwright install ${browserName}\`. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  sharedBrowsers.set(browserName, launched);
  scheduleBrowserClose();
  return launched;
}

async function waitForOpenState(page: Page, storyId: string): Promise<void> {
  await page
    .waitForFunction(
      (id) => {
        const preparing = document.querySelector(
          ".sb-show-preparing-story, .sb-show-preparing-docs",
        );
        if (preparing) return false;
        if (id.includes("open-menu") || id.includes("--open-")) {
          return Boolean(
            document.querySelector(
              '[role="listbox"], [role="menu"], [data-state="open"]',
            ),
          );
        }
        return true;
      },
      storyId,
      { timeout: 8000 },
    )
    .catch(() => {
      /* still screenshot */
    });
}

/**
 * Capture the story subject with the selected Playwright browser — same pipeline intent as
 * `tests/visual/storybook.spec.ts` (device scale, subject/portal clip).
 */
export async function captureSubjectWithBrowser(
  request: CaptureSubjectRequest,
  onProgress?: (progress: CaptureSubjectProgress) => void,
): Promise<CaptureSubjectResult> {
  const origin = request.origin.replace(/\/$/, "");
  if (!origin.startsWith("http")) {
    throw new Error("origin must be an absolute http(s) Storybook URL");
  }
  if (!request.storyId?.trim()) {
    throw new Error("storyId is required");
  }

  const viewport = request.viewport ?? VISUAL_VIEWPORT;
  const deviceScaleFactor =
    request.deviceScaleFactor ?? VISUAL_DEVICE_SCALE_FACTOR;

  const browserName = request.browser ?? "chromium";
  if (!isVisualDeltaBrowser(browserName)) {
    throw new Error(`Unsupported Visual Delta browser: ${String(browserName)}`);
  }
  const browser = await getBrowser(browserName, onProgress);
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light",
    reducedMotion: "reduce",
  });

  try {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.documentElement.appendChild(style);
    });

    const params = new URLSearchParams({
      id: request.storyId,
      viewMode: "story",
    });
    if (request.visualCaptureUntil) {
      params.set(VISUAL_CAPTURE_UNTIL_PARAM, request.visualCaptureUntil);
    }
    if (request.visualCaptureCallId) {
      params.set(VISUAL_CAPTURE_CALL_PARAM, request.visualCaptureCallId);
      params.set("instrument", "true");
    }
    if (request.globals) params.set("globals", request.globals);

    onProgress?.({
      phase: "navigating",
      label: PHASE_LABELS.navigating,
    });
    await page.goto(`${origin}/iframe.html?${params.toString()}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    onProgress?.({
      phase: "settling",
      label: PHASE_LABELS.settling,
    });
    if (request.visualCaptureUntil) {
      await page
        .waitForFunction(
          ({ attr, target }) =>
            document.documentElement.getAttribute(attr) === target,
          {
            attr: VISUAL_CAPTURE_READY_ATTR,
            target: request.visualCaptureUntil,
          },
          { timeout: 30_000 },
        )
        .catch((error) => {
          throw new Error(
            `Interaction capture did not reach ${request.visualCaptureUntil}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    } else {
      await waitForVisualStoryFinished(page, request.storyId);
    }

    await waitForOpenState(page, request.storyId);

    const fromDom = await page.evaluate(
      (attrs: { delay: string; ignore: string; crop: string }) => {
        const root = document.documentElement;
        const delayRaw = root.getAttribute(attrs.delay);
        const ignoreRaw = root.getAttribute(attrs.ignore);
        return {
          delay: delayRaw ? Number(delayRaw) : 0,
          ignoreSelectors: ignoreRaw
            ? ignoreRaw.split("\n").filter(Boolean)
            : [],
          cropToViewport: root.getAttribute(attrs.crop) === "1",
        };
      },
      {
        delay: VISUAL_DELTA_DELAY_ATTR,
        ignore: VISUAL_DELTA_IGNORE_ATTR_LIST,
        crop: VISUAL_DELTA_CROP_ATTR,
      },
    );
    const delayMs =
      typeof request.delay === "number"
        ? Math.max(0, request.delay)
        : Math.max(0, fromDom.delay);
    await settleVisualStoryPage(page, { delay: delayMs });

    const ignoreSelectors = resolveIgnoreSelectors([
      ...(request.ignoreSelectors ?? []),
      ...fromDom.ignoreSelectors,
    ]);
    const mask = ignoreSelectors.map((sel) => page.locator(sel));
    const cropToViewport = request.cropToViewport ?? fromDom.cropToViewport;

    onProgress?.({
      phase: "capturing",
      label: PHASE_LABELS.capturing,
    });
    const clip = cropToViewport
      ? null
      : await page.evaluate(
          measureVisualCaptureClip,
          VISUAL_CAPTURE_SURFACE_SELECTORS,
        );

    let png: Buffer;
    if (cropToViewport) {
      png = await page.screenshot({
        animations: "disabled",
        caret: "hide",
        scale: "device",
        type: "png",
        ...(mask.length > 0 ? { mask } : {}),
      });
    } else if (clip) {
      png = await page.screenshot({
        clip,
        animations: "disabled",
        caret: "hide",
        scale: "device",
        type: "png",
        ...(mask.length > 0 ? { mask } : {}),
      });
    } else {
      const root = page.locator("#storybook-root");
      const childCount = await root.locator(":scope > *").count();
      const subject =
        childCount > 0 ? root.locator(":scope > *").first() : root;
      await subject.waitFor({ state: "visible", timeout: 10_000 });
      png = await subject.screenshot({
        animations: "disabled",
        caret: "hide",
        scale: "device",
        type: "png",
        ...(mask.length > 0 ? { mask } : {}),
      });
    }

    onProgress?.({
      phase: "encoding",
      label: PHASE_LABELS.encoding,
    });
    // Read PNG IHDR for dimensions without an extra dependency.
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);

    return {
      ok: true,
      pngBase64: png.toString("base64"),
      width,
      height,
      environment: { browser: browserName, platform: process.platform },
    };
  } finally {
    await page.close().catch(() => {
      /* ignore */
    });
    scheduleBrowserClose();
  }
}

/** Compatibility alias for existing Chromium callers. */
export async function captureSubjectWithChromium(
  request: CaptureSubjectRequest,
  onProgress?: (progress: CaptureSubjectProgress) => void,
): Promise<CaptureSubjectResult> {
  return captureSubjectWithBrowser(
    { ...request, browser: request.browser ?? "chromium" },
    onProgress,
  );
}
