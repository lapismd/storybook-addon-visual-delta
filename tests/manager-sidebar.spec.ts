import { expect, test, type Page } from "@playwright/test";
import {
  MANAGER_FIXTURE,
  mockVisualBackend,
  openManager,
} from "./manager-test-support.js";

const DEV_STORYBOOK = "http://127.0.0.1:9013";

async function openStoryContextMenu(page: Page) {
  const storyItem = page.locator(`[data-item-id="${MANAGER_FIXTURE}"]`);
  await expect(storyItem).toBeVisible();
  await storyItem.hover();
  await page.getByRole("button", { name: "Open context menu" }).click();
  const contextMenu = page.getByTestId("visual-test-module-context");
  await expect(contextMenu).toBeVisible();
  return contextMenu;
}

test.describe("Visual Delta Storybook sidebar menus", () => {
  test("renders the global module and real story context menu", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);

    const globalModule = page.getByTestId("visual-test-module-global");
    await expect(globalModule).toBeVisible();
    await expect(globalModule).toHaveScreenshot([
      "sidebar",
      "global-testing-module.png",
    ]);

    const contextMenu = await openStoryContextMenu(page);
    await expect(contextMenu).toHaveScreenshot([
      "sidebar",
      "story-context-menu.png",
    ]);
    await expect(page).toHaveScreenshot([
      "sidebar",
      "story-context-menu-manager-window.png",
    ]);
    expect(writes).toEqual([]);
  });

  test("changes baseline write mode through the context-menu chooser", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);
    const contextMenu = await openStoryContextMenu(page);

    await contextMenu
      .getByRole("button", {
        name: "Choose Create missing or Rewrite existing",
      })
      .click();
    const rewriteExisting = page.getByText("Rewrite existing", { exact: true });
    await expect(rewriteExisting).toBeVisible();
    await expect(page).toHaveScreenshot([
      "sidebar",
      "baseline-mode-chooser-manager-window.png",
    ]);
    await rewriteExisting.click();

    await expect(
      contextMenu.getByRole("checkbox", { name: /update baselines/i }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
});
