import { expect, test, type Page } from "@playwright/test";
import {
  settleVisualStoryPage,
  waitForVisualStoryFinished,
} from "../src/playwright/readiness.js";

const CASES = [
  ["passed", "visual-delta-panel-shell--passed-result", true],
  ["running", "visual-delta-panel-shell--running-result", false],
  [
    "configuration-warning",
    "visual-delta-panel-shell--configuration-warnings",
    false,
  ],
  ["missing-baseline", "visual-delta-panel-shell--missing-baseline", true],
  [
    "mixed-mode-failure",
    "visual-delta-panel-shell--mixed-mode-failure",
    true,
  ],
  ["capture-error", "visual-delta-panel-shell--capture-error", true],
] as const;
const DELAYED_PLAY = "visual-delta-panel-shell--delayed-story-completion";

async function openPanelStory(page: Page, storyId: string) {
  const params = new URLSearchParams({ id: storyId, viewMode: "story" });
  await page.goto(`/iframe.html?${params.toString()}`, {
    waitUntil: "networkidle",
  });
  await waitForVisualStoryFinished(page, storyId);
  await settleVisualStoryPage(page);
  const panel = page.getByTestId("panel-shell");
  await expect(panel).toBeVisible();
  return panel;
}

for (const layout of [
  { name: "wide-bottom", viewport: { width: 1280, height: 900 } },
  { name: "narrow-right", viewport: { width: 420, height: 900 } },
] as const) {
  test.describe(layout.name, () => {
    test.use({ viewport: layout.viewport });

    for (const [name, storyId, hasVisualBaseline] of CASES) {
      test(name, async ({ page }) => {
        const panel = await openPanelStory(page, storyId);
        if (hasVisualBaseline) {
          await expect(panel).toHaveScreenshot([layout.name, `${name}.png`]);
          return;
        }
        if (name === "running") {
          await expect(
            panel.getByRole("status", {
              name: "Visual test running. Comparing the current story",
            }),
          ).toBeVisible();
          return;
        }
        await expect(
          panel.getByRole("heading", { name: "Configuration" }),
        ).toBeVisible();
        await expect(
          panel.getByRole("list", { name: "Configuration diagnostics" }),
        ).toBeVisible();
      });
    }
  });
}

test("waits for storyFinished before declaring a delayed play ready", async ({
  page,
}) => {
  const startedAt = Date.now();
  await openPanelStory(page, DELAYED_PLAY);
  await expect(
    page.locator("[data-visual-delta-delayed-play]"),
  ).toHaveAttribute("data-visual-delta-delayed-play", "complete");
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
});
