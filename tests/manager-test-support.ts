import { expect, type Page } from "@playwright/test";
import type { VisualBaselineEnvironment } from "../src/shared/environments.js";
import type { VisualStoryFact } from "../src/shared/story-facts.js";

export const MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-integration-fixture";
export const COMPONENT_OVERLAY_FIXTURE = "shadcn-actions-button--default";
export const FULL_VIEWPORT_MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-full-viewport-integration-fixture";
export const CUSTOM_VIEWPORT_MANAGER_FIXTURE =
  "visual-delta-panel-shell--responsive-1440-viewport-canary";
export const DELAYED_OVERLAY_FIXTURE =
  "visual-delta-panel-shell--delayed-story-completion";
export const DELAYED_MISSING_BASELINE_FIXTURE =
  "visual-delta-readiness-fixture--delayed-missing-baseline";
export const AI_SEND_BUTTON_STATES = "ai-chat-send-button--states";
export const NATURAL_WIDTH_COMPONENT_FIXTURE =
  "ui-forms-form-inputs-task-due-calendar--shows-a-selected-date";
export const OVERVIEW = "visual-delta-panel-shell--overview";

const CONFIG = {
  ok: true,
  options: {
    root: "/workspace/ui",
    snapshotDir: "/workspace/ui/tests/visual/storybook.spec.ts-snapshots",
    baselinePathMode: "nested-import",
    visualServerPort: 9010,
    allowRebuild: true,
    allowVcsWrites: false,
    visualUpdateArgs: ["visual-delta", "update"],
    visualInteractionUpdateArgs: ["visual-delta", "interaction-update"],
    visualTestArgs: ["playwright", "test"],
    addonSrcDir: null,
  },
  playwrightPassThresholdPercent: 1,
  browsers: ["chromium", "firefox"],
  runtimePlatform: "darwin",
  availableEnvironments: [
    { browser: "chromium", platform: "darwin" },
    { browser: "chromium", platform: "linux" },
  ],
  projectDefaults: {
    passThresholdPercent: 1,
    diffThreshold: 0.2,
    diffIncludeAntiAliasing: false,
    delay: 0,
    cropToViewport: false,
    placement: "right",
    opacity: 0.5,
    baselineLabelOffset: { x: 0, y: 0 },
    previewSplitZoomDefault: "fit",
    diffResultZoomDefault: "100%",
  },
  workflow: {
    autoAcceptLiveStoryComparisons: false,
    visualTestFailureMode: "warn",
    vcs: {
      mode: "off",
      commitMessageTemplate: "Visual Delta: {action} {scope}",
    },
  },
  vcs: {
    kind: "jj",
    available: true,
    writeAllowed: false,
    reason: "VCS commits are disabled in browser tests.",
  },
  projectDefaultSources: {
    passThresholdPercent: "built-in",
    diffThreshold: "built-in",
    diffIncludeAntiAliasing: "built-in",
    delay: "built-in",
    deviceScaleFactor: "built-in",
    cropToViewport: "built-in",
    placement: "built-in",
    opacity: "built-in",
    baselineLabelOffset: "built-in",
    previewSplitZoomDefault: "built-in",
    diffResultZoomDefault: "built-in",
  },
  projectConfigPath: "/workspace/ui/.visual-delta/config.json",
  projectConfigExists: false,
  onboarding: {
    suiteReady: true,
    playwrightConfigReady: true,
    snapshotDirExists: true,
    ready: true,
    hint: "Visual Delta is ready.",
  },
  diagnostics: [],
  warnings: [],
};

const HISTORY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function mockVisualBackend(
  page: Page,
  options: {
    runtimeInstanceId?: () => string;
    availableEnvironments?: VisualBaselineEnvironment[];
    requiredEnvironments?: VisualBaselineEnvironment[];
    storyFact?: (storyId: string) => Partial<VisualStoryFact>;
  } = {},
) {
  const writes: string[] = [];
  const availableEnvironments =
    options.availableEnvironments ?? CONFIG.availableEnvironments;
  const requiredEnvironments = options.requiredEnvironments ?? [
    { browser: "chromium" as const, platform: "darwin" },
    { browser: "chromium" as const, platform: "linux" },
    { browser: "firefox" as const, platform: "darwin" },
    { browser: "firefox" as const, platform: "linux" },
  ];
  await page.route("**/__visual-delta/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isStoryFacts = url.pathname.endsWith("/story-facts");
    if (request.method() !== "GET" && !isStoryFacts) {
      writes.push(url.pathname);
    }
    if (isStoryFacts) {
      const body = request.postDataJSON() as {
        stories?: Array<{ id?: string }>;
      };
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          version: 3,
          generatedAt: Date.now(),
          availableEnvironments,
          requiredEnvironments,
          stories: (body.stories ?? []).flatMap((story) =>
            story.id
              ? [
                  {
                    storyId: story.id,
                    baseline: "present",
                    environmentCoverage: requiredEnvironments.map(
                      (environment) => ({
                        ...environment,
                        baseline: availableEnvironments.some(
                          (available) =>
                            available.browser === environment.browser &&
                            available.platform === environment.platform,
                        )
                          ? ("present" as const)
                          : ("missing" as const),
                      }),
                    ),
                    ...options.storyFact?.(story.id),
                  },
                ]
              : [],
          ),
        },
      });
      return;
    }
    if (url.pathname.endsWith("/config")) {
      await route.fulfill({ status: 200, json: CONFIG });
      return;
    }
    if (url.pathname.endsWith("/compare-story")) {
      const body = request.postDataJSON() as {
        storyId: string;
        baselineUrl?: string;
        browser?: "chromium" | "firefox" | "webkit";
      };
      const sidecar = {
        version: 2,
        storyId: body.storyId,
        snapshotRel: body.baselineUrl ?? "baseline.png",
        status: "passed",
        runnerStatus: "passed",
        outcome: "passed",
        generatedAt: new Date().toISOString(),
        tool: "playwright",
        operationId: `mock-${Date.now()}`,
        baselineHash: "mock-baseline-hash",
        captureConfigHash: "mock-config-hash",
        diffPixels: 0,
        totalPixels: 1,
        diffPercent: 0,
        passThresholdPercent: 1,
        passed: true,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({ type: "start", storyId: body.storyId }),
          JSON.stringify({
            type: "progress",
            phase: "capturing",
            label: "Capturing…",
          }),
          JSON.stringify({
            type: "done",
            ok: true,
            storyId: body.storyId,
            sidecar,
            environment: {
              browser: body.browser ?? "chromium",
              platform: "darwin",
            },
          }),
          "",
        ].join("\n"),
      });
      return;
    }
    if (url.pathname.endsWith("/runtime")) {
      await route.fulfill({
        status: 200,
        headers: { "Cache-Control": "no-store" },
        json: {
          ok: true,
          instanceId: options.runtimeInstanceId?.() ?? "manager-test-runtime",
        },
      });
      return;
    }
    if (url.pathname.endsWith("/baseline-history/image")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: HISTORY_PNG,
        headers: { "Cache-Control": "no-store" },
      });
      return;
    }
    if (url.pathname.endsWith("/baseline-history/diff")) {
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          beforeRevisionId: url.searchParams.get("before") ?? "b".repeat(40),
          afterRevisionId: url.searchParams.get("after") ?? "a".repeat(40),
          truncated: false,
          files: [
            {
              beforePath: "src/shared/shadcn/button/Button.svelte",
              afterPath: "src/shared/shadcn/button/Button.svelte",
              hunks: [
                {
                  header: "@@ -12 +12 @@",
                  lines: [
                    {
                      beforeNumber: 12,
                      afterNumber: 12,
                      before: '<button class="compact">',
                      after: '<button class="comfortable">',
                      kind: "changed",
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      return;
    }
    if (url.pathname.endsWith("/baseline-history")) {
      const baselinePath = url.searchParams.get("path") ?? "baseline.png";
      const imageUrl = (revision: string) =>
        `/__visual-delta/baseline-history/image?path=${encodeURIComponent(baselinePath)}&revision=${revision}`;
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          vcs: "jj",
          followsRenames: false,
          entries: [
            {
              revisionId: "a".repeat(40),
              displayId: "kmrusxzponml",
              secondaryId: "aaaaaaaaaaaa",
              subject: "Update visual baseline",
              message: "Update visual baseline",
              author: "Visual Tester",
              authoredAt: "2026-07-25T12:00:00Z",
              source: "commit",
              imageUrl: imageUrl("a".repeat(40)),
            },
            {
              revisionId: "b".repeat(40),
              displayId: "qpvuntsmznwk",
              secondaryId: "bbbbbbbbbbbb",
              subject: "Create visual baseline",
              message: "Create visual baseline",
              author: "Visual Tester",
              authoredAt: "2026-07-24T12:00:00Z",
              source: "commit",
              imageUrl: imageUrl("b".repeat(40)),
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (url.pathname.endsWith("/run-events")) {
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: '{"type":"idle"}\n',
      });
      return;
    }
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  return writes;
}

async function dismissStorybookChrome(page: Page) {
  for (const name of [
    "Dismiss notification",
    "Close what's new dialog",
    "Skip onboarding",
    "Dismiss",
  ]) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true }).catch(() => undefined);
    }
  }
}

/** Click a control that may sit under transient panel status chrome. */
export async function clickThrough(locator: {
  click: (options?: { force?: boolean }) => Promise<void>;
  evaluate?: (fn: (el: HTMLElement) => void) => Promise<void>;
  dispatchEvent?: (type: string) => Promise<void>;
}) {
  if (typeof locator.evaluate === "function") {
    await locator.evaluate((el) => {
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
    });
    return;
  }
  await locator.click({ force: true });
}

export async function openManager(
  page: Page,
  storyId = MANAGER_FIXTURE,
  origin = "",
) {
  await page.goto(
    `${origin}/?path=/story/${storyId}&panel=visual-delta%2Fpanel`,
    {
      waitUntil: "networkidle",
    },
  );
  await dismissStorybookChrome(page);
  const visualDeltaTab = page.getByRole("tab", { name: "Visual Delta" });
  await expect(visualDeltaTab).toBeVisible();
  if ((await visualDeltaTab.getAttribute("aria-selected")) !== "true") {
    await visualDeltaTab.click();
  }
  await expect(
    page.getByRole("tabpanel", { name: "Visual Delta" }),
  ).toBeVisible();
  await dismissStorybookChrome(page);
}

export function previewFrame(page: Page) {
  return page.frameLocator('iframe[title="storybook-preview-iframe"]');
}
