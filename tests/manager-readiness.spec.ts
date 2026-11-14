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
    const createDefault = panel.getByRole("button", {
      name: "Create Default baseline",
    });
    await expect(createDefault).toHaveCount(2);
    for (const control of await createDefault.all()) {
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
    }
    await expect(
      panel.getByRole("button", { name: /Create .*baseline/i }),
    ).not.toHaveCount(0);
  });
});
