import { expect, type Page } from "@playwright/test";

export const MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-integration-fixture";
export const FULL_VIEWPORT_MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-full-viewport-integration-fixture";
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

export async function mockVisualBackend(page: Page) {
  const writes: string[] = [];
  await page.route("**/__visual-delta/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") writes.push(url.pathname);
    if (url.pathname.endsWith("/config")) {
      await route.fulfill({ status: 200, json: CONFIG });
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
