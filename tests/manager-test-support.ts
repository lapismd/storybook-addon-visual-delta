import { expect, type Page } from "@playwright/test";

export const MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-integration-fixture";
export const COMPONENT_OVERLAY_FIXTURE = "shadcn-actions-button--default";
export const FULL_VIEWPORT_MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-full-viewport-integration-fixture";
export const CUSTOM_VIEWPORT_MANAGER_FIXTURE =
  "visual-delta-panel-shell--responsive-1440-viewport-canary";
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
    visualUpdateArgs: ["visual-delta", "update"],
    visualInteractionUpdateArgs: ["visual-delta", "interaction-update"],
    visualTestArgs: ["playwright", "test"],
  },
  playwrightPassThresholdPercent: 1,
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
    diffResultZoomDefault: "fit",
  },
  projectDefaultSources: {
    passThresholdPercent: "built-in",
    diffThreshold: "built-in",
    diffIncludeAntiAliasing: "built-in",
    delay: "built-in",
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

export async function mockVisualBackend(
  page: Page,
  options: { runtimeInstanceId?: () => string } = {},
) {
  const writes: string[] = [];
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
          version: 1,
          generatedAt: Date.now(),
          stories: (body.stories ?? []).flatMap((story) =>
            story.id ? [{ storyId: story.id, baseline: "present" }] : [],
          ),
        },
      });
      return;
    }
    if (url.pathname.endsWith("/config")) {
      await route.fulfill({ status: 200, json: CONFIG });
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
  const visualDeltaTab = page.getByRole("tab", { name: "Visual Delta" });
  await expect(visualDeltaTab).toBeVisible();
  if ((await visualDeltaTab.getAttribute("aria-selected")) !== "true") {
    await visualDeltaTab.click();
  }
  await expect(
    page.getByRole("tabpanel", { name: "Visual Delta" }),
  ).toBeVisible();
}

export function previewFrame(page: Page) {
  return page.frameLocator('iframe[title="storybook-preview-iframe"]');
}
