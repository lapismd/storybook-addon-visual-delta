import { expect, test } from "@playwright/test";
import {
  DELAYED_MISSING_BASELINE_FIXTURE,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const DEV_STORYBOOK = `http://127.0.0.1:${
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
  Number(process.env.STORYBOOK_PORT ?? "9009") + 4
}`;

test.describe("Visual Delta manager integration", () => {
  test("keeps a delayed missing baseline provisional until storyFinished", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, DELAYED_MISSING_BASELINE_FIXTURE, DEV_STORYBOOK, {
      readiness: "provisional",
    });
    await expect(
      previewFrame(page).locator("[data-visual-delta-delayed-missing]"),
    ).toHaveAttribute("data-visual-delta-delayed-missing", "pending", {
      timeout: test.info().timeout,
    });

    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("status", { name: "Loading Visual Delta" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Create .*baseline/i }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toHaveCount(0);

    await previewFrame(page)
      .getByRole("button", { name: "Finish delayed play" })
      .click();

    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible({ timeout: 10_000 });
    const baselines = panel.getByRole("region", {
      name: "Visual baselines and interactions",
    });
    const createDefault = baselines
      .getByRole("button", { name: "Create Default baseline", exact: true })
      .and(baselines.getByTitle("Create Default baseline", { exact: true }));
    await expect(createDefault).toHaveCount(1);
    await expect(createDefault).toBeVisible();
    await expect(createDefault).toBeEnabled();
    await expect(
      panel.getByRole("button", { name: /Create .*baseline/i }),
    ).not.toHaveCount(0);
  });
});
