import { expect, test, type Locator, type Page } from "@playwright/test";
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
  ["mixed-mode-failure", "visual-delta-panel-shell--mixed-mode-failure", true],
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

async function expectFullWidthStatusFooter(panel: Locator) {
  const footer = panel.getByRole("status").last();
  await expect(footer).toBeVisible();

  const [panelBox, footerBox] = await Promise.all([
    panel.boundingBox(),
    footer.boundingBox(),
  ]);
  expect(panelBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(Math.abs(footerBox!.x - panelBox!.x)).toBeLessThan(1);
  expect(Math.abs(footerBox!.width - panelBox!.width)).toBeLessThan(1);
  await expect(footer).toHaveCSS("border-top-left-radius", "0px");
  await expect(footer).toHaveCSS("border-left-width", "0px");
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
          const status = panel.getByRole("status", {
            name: "Visual test running. Comparing the current story",
          });
          await expect(status).toBeVisible();
          await expectFullWidthStatusFooter(panel);
          const stopButton = panel.getByRole("button", {
            name: "Stop visual run",
          });
          await expect(stopButton).toBeVisible();
          expect(
            await stopButton.evaluate(
              (button) =>
                button.closest('[data-testid="status-popover"]') === null,
            ),
          ).toBe(true);
          const logButton = panel.getByRole("button", {
            name: /Progress: ✓ filter-search--with-query \(7\/12\)/,
          });
          await logButton.click();
          const richLines = page
            .locator('[data-ansi-foreground="standard-2"]')
            .filter({ hasText: "filter-search--with-query" });
          await expect(richLines).toHaveCount(2);
          await expect(richLines.first()).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
          );
          await expect(richLines.last()).toHaveCSS(
            "color",
            "rgb(152, 195, 121)",
          );
          await expect(richLines.last()).toHaveCSS(
            "background-color",
            "rgb(97, 175, 239)",
          );
          const progressDialog = page.getByRole("dialog", {
            name: "Visual Delta progress log",
          });
          await expect(progressDialog).toHaveAttribute("aria-modal", "false");
          expect(await page.locator("body").innerText()).not.toContain(
            "\u001b",
          );
          await stopButton.focus();
          await expect(stopButton).toBeFocused();
          await expect(progressDialog).toBeVisible();
          await stopButton.click();
          await expect(stopButton).toBeHidden();
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
