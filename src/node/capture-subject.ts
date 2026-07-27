import type { Browser, Page } from "playwright";
import { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT } from "../constants.js";
import {
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
import type {
  CaptureSubjectPhase,
  CaptureSubjectProgress,
  CaptureSubjectResult,
} from "../shared/capture-subject-types.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";

export type {
  CaptureSubjectPhase,
  CaptureSubjectProgress,
  CaptureSubjectResult,
  CaptureSubjectStreamEvent,
} from "../shared/capture-subject-types.js";

const PORTAL_SELECTORS = [
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[data-state="open"]',
].join(", ");

export type CaptureSubjectRequest = {
  /** Absolute Storybook origin, e.g. http://localhost:9009 */
  origin: string;
  storyId: string;
  /** Park play after this step id (interaction baselines). */
  visualCaptureUntil?: string;
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
};

export type CaptureSubjectError = {
  ok: false;
  error: string;
};

let sharedBrowser: Browser | null = null;
let browserIdleTimer: ReturnType<typeof setTimeout> | null = null;
const BROWSER_IDLE_MS = 60_000;

const PHASE_LABELS: Record<CaptureSubjectPhase, string> = {
  launching: "Launching Chromium…",
  navigating: "Loading story…",
  settling: "Waiting for play…",
  capturing: "Capturing…",
  encoding: "Encoding…",
};

function scheduleBrowserClose() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(() => {
    browserIdleTimer = null;
    const browser = sharedBrowser;
    sharedBrowser = null;
    void browser?.close().catch(() => {
      /* ignore */
    });
  }, BROWSER_IDLE_MS);
}

async function getBrowser(
  onProgress?: (progress: CaptureSubjectProgress) => void,
): Promise<Browser> {
  if (sharedBrowser) {
    scheduleBrowserClose();
    return sharedBrowser;
  }
  onProgress?.({
    phase: "launching",
    label: PHASE_LABELS.launching,
  });
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is required for Chromium Diff. Install `playwright` in the host project.",
    );
  }
  sharedBrowser = await playwright.chromium.launch({ headless: true });
  scheduleBrowserClose();
  return sharedBrowser;
}

/**
 * Union clip for portals rendered *outside* `#storybook-root` (dialogs, menus).
 * Bases the clip on the story subject (`#storybook-root > *`), not the root
 * itself — root is often `min-height: 100vh` and would capture the viewport.
 * In-tree `[data-state="open"]` (e.g. Accordion) must NOT trigger this path.
 */
async function portalUnionClip(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((selectors) => {
    const root = document.querySelector("#storybook-root");
    if (!root) return null;
    const subject = root.querySelector(":scope > *") ?? root;
    const rects: DOMRect[] = [];
    for (const el of document.querySelectorAll(selectors)) {
      if (!(el instanceof HTMLElement)) continue;
      // Accordion/Collapsible mark open items with data-state=open inside root.
      if (root.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      rects.push(r);
    }
    // No outside portals → caller should screenshot the story subject instead.
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
 * Capture the story subject with Playwright Chromium — same pipeline intent as
 * `tests/visual/storybook.spec.ts` (device scale, subject/portal clip).
 */
export async function captureSubjectWithChromium(
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

  const browser = await getBrowser(onProgress);
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor,
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
          (attr) => document.documentElement.getAttribute(attr) === "1",
          VISUAL_CAPTURE_READY_ATTR,
          { timeout: 30_000 },
        )
        .catch(() => {
          /* fall through to settle */
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
    // Prefer outside-root portal union (dialogs/menus). In-tree open state
    // (Accordion) yields null → subject screenshot, same as the host suite.
    const clip = cropToViewport ? null : await portalUnionClip(page);

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
    };
  } finally {
    await page.close().catch(() => {
      /* ignore */
    });
    scheduleBrowserClose();
  }
}
