import { expect, test } from "@playwright/test";
import {
  CUSTOM_VIEWPORT_MANAGER_FIXTURE,
  MANAGER_FIXTURE,
  OVERVIEW,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const DEV_STORYBOOK = "http://127.0.0.1:9013";

test.describe("Visual Delta manager integration", () => {
  test("registers the panel, clears stale story state, and reports ignore counts", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page);

    await expect(
      page.getByRole("button", {
        name: "Visual mode: Default, not run",
      }),
    ).toBeVisible();
    const ignore = page.getByRole("switch", {
      name: "Highlight 1 ignored region",
    });
    await expect(ignore).toBeVisible();
    await ignore.click();
    await expect(
      previewFrame(page).locator("#visual-delta-highlight-ignore"),
    ).toHaveCount(1);

    await page.locator(`a[href*="${OVERVIEW}"]`).click();
    await expect(page).toHaveURL(new RegExp(OVERVIEW));
    await expect(
      page.getByRole("button", { name: /Visual mode:/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: /ignored region/ }),
    ).toHaveCount(0);

    await page.locator(`a[href*="${MANAGER_FIXTURE}"]`).click();
    await expect(
      page.getByRole("button", {
        name: "Visual mode: Default, not run",
      }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("restores docking after review layout and applies mode globals", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page);

    const moveRight = page.getByRole("button", {
      name: "Move addon panel to right",
    });
    await expect(moveRight).toBeVisible();
    await moveRight.click();
    await expect(
      page.getByRole("button", { name: "Move addon panel to bottom" }),
    ).toBeVisible();

    const panel = page.getByTestId("visual-delta-panel");
    await panel.getByRole("switch", { name: "Review layout" }).click();
    await expect(
      panel.getByRole("switch", { name: "Exit review layout" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Move addon panel to right" }),
    ).toBeVisible();

    await panel.getByRole("switch", { name: "Exit review layout" }).click();
    await expect(
      page.getByRole("button", { name: "Move addon panel to bottom" }),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: "Visual mode: Default, not run",
      })
      .click();
    await page
      .getByRole("button", { name: "Dark desktop mode, not run" })
      .click();
    await expect(previewFrame(page).locator("html")).toHaveClass(/dark/);
    expect(writes).toEqual([]);
  });

  test("Diff HTML proves a per-image viewport from narrow right docking", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    const writes = await mockVisualBackend(page);
    await openManager(page, CUSTOM_VIEWPORT_MANAGER_FIXTURE, DEV_STORYBOOK);

    const moveRight = page.getByRole("button", {
      name: "Move addon panel to right",
    });
    if (await moveRight.isVisible()) await moveRight.click();

    await page
      .getByRole("button", { name: /Compare via html-to-image/ })
      .click();
    await expect(page.getByLabel(/Visual compare/)).toBeVisible({
      timeout: 20_000,
    });

    const diagnostics = page.getByTestId("diff-capture-diagnostics");
    await expect(diagnostics).toContainText(
      "viewport requested 1440×960, observed 1440×960 at 3×",
    );
    await expect(diagnostics).toContainText("bitmap 4320×2880");
    expect(writes).toEqual([]);
  });
});
