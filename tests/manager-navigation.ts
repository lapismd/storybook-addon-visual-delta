import { expect, test, type Page } from "@playwright/test";

export const MANAGER_FIXTURE =
  "visual-delta-panel-shell--manager-integration-fixture";

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

export function previewFrame(page: Page) {
  return page.frameLocator('iframe[title="storybook-preview-iframe"]');
}

export async function waitForStoryFinished(page: Page, storyId: string) {
  await expect(previewFrame(page).locator("html")).toHaveAttribute(
    "data-visual-delta-story-finished",
    storyId,
    { timeout: test.info().timeout },
  );
}

export async function openManager(
  page: Page,
  storyId = MANAGER_FIXTURE,
  origin = "",
  options: { readiness?: "complete" | "provisional" } = {},
) {
  await page.goto(
    `${origin}/?path=/story/${storyId}&panel=visual-delta%2Fpanel`,
    { waitUntil: "domcontentloaded" },
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
  const panel = page.getByTestId("visual-delta-panel");
  await expect(panel).toBeVisible();
  if (options.readiness !== "provisional") {
    await waitForStoryFinished(page, storyId);
    await expect(
      panel.getByRole("status", { name: "Loading Visual Delta" }),
    ).toHaveCount(0);
  }
}
