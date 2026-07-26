import type { Page } from "@playwright/test";
import {
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_STORY_FINISHED_ATTR,
} from "../shared/capture-params-attrs.js";

/** Wait for the preview's Storybook render and play function to finish. */
export async function waitForVisualStoryFinished(
  page: Page,
  storyId: string,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    ({ attr, expected }) =>
      document.documentElement.getAttribute(attr) === expected,
    { attr: VISUAL_DELTA_STORY_FINISHED_ATTR, expected: storyId },
    { timeout },
  );
}

/**
 * Settle only deterministic capture inputs after Storybook has finished:
 * preparation chrome, fonts, an explicit story delay, and focus/caret state.
 */
export async function settleVisualStoryPage(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          ".sb-show-preparing-story, .sb-show-preparing-docs",
        ),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);

  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  const delayAttr = await page
    .locator("html")
    .getAttribute(VISUAL_DELTA_DELAY_ATTR);
  const delay = Number(delayAttr);
  if (Number.isFinite(delay) && delay > 0) {
    await page.waitForTimeout(delay);
  }

  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}
