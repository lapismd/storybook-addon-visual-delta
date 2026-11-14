import { expect, test } from "@playwright/test";
import { mockVisualBackend, openManager } from "./manager-test-support.js";

const origin = `http://127.0.0.1:${
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
  Number(process.env.STORYBOOK_PORT ?? "9009") + 4
}`;

test("opens the manager while an unrelated request remains pending", async ({
  page,
}) => {
  await mockVisualBackend(page);
  await page.route(
    "**/__manager-navigation-pending",
    () => new Promise(() => {}),
  );
  await page.addInitScript(() => {
    if (window === window.top) void fetch("/__manager-navigation-pending");
  });

  await openManager(page, undefined, origin);
  await expect(page.getByTestId("visual-delta-panel")).toBeVisible();
});
