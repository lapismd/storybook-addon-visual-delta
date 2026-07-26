import { expect, test } from "@playwright/test";
import {
  FULL_VIEWPORT_MANAGER_FIXTURE,
  MANAGER_FIXTURE,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const CAPTURE_KINDS = [
  {
    name: "component-baseline",
    storyId: MANAGER_FIXTURE,
    expectedNaturalSize: { width: 3696, height: 204 },
  },
  {
    name: "full-viewport-baseline",
    storyId: FULL_VIEWPORT_MANAGER_FIXTURE,
    expectedNaturalSize: { width: 3840, height: 2700 },
  },
] as const;

const PLACEMENTS = [
  { name: "above", label: "Baseline above live", baselineFirst: true },
  { name: "left", label: "Baseline left of live", baselineFirst: true },
  {
    name: "right",
    label: "Hide overlay (Baseline right of live)",
    baselineFirst: false,
  },
  { name: "below", label: "Baseline below live", baselineFirst: false },
] as const;

test.describe("Visual Delta manager overlay placement", () => {
  for (const capture of CAPTURE_KINDS) {
    test.describe(capture.name, () => {
      for (const placement of PLACEMENTS) {
        test(placement.name, async ({ page }) => {
          const writes = await mockVisualBackend(page);
          await openManager(page, capture.storyId);

          const panel = page.getByTestId("visual-delta-panel");
          if (placement.name !== "right") {
            await panel.getByRole("switch", { name: placement.label }).click();
          }
          await expect(
            panel.getByRole("switch", {
              name: `Hide overlay (Baseline ${
                placement.name === "above"
                  ? "above"
                  : placement.name === "below"
                    ? "below"
                    : `${placement.name} of`
              } live)`,
            }),
          ).toBeChecked();

          const frame = previewFrame(page);
          const split = frame.locator("#visual-delta-split");
          const panes = frame.locator("#visual-delta-panes");
          const baselineImage = frame.locator(
            "#visual-delta-baseline-pane #visual-delta-overlay img",
          );
          await expect(split).toBeVisible();
          await expect(baselineImage).toBeVisible();
          await expect
            .poll(() =>
              baselineImage.evaluate((image: HTMLImageElement) => ({
                width: image.naturalWidth,
                height: image.naturalHeight,
              })),
            )
            .toEqual(capture.expectedNaturalSize);

          await expect(panes).toHaveCSS(
            "flex-direction",
            placement.name === "left" || placement.name === "right"
              ? "row"
              : "column",
          );
          await expect
            .poll(() =>
              panes.evaluate((element) =>
                Array.from(element.children)
                  .slice(0, 2)
                  .map((child) => child.id),
              ),
            )
            .toEqual(
              placement.baselineFirst
                ? ["visual-delta-baseline-pane", "visual-delta-live-pane"]
                : ["visual-delta-live-pane", "visual-delta-baseline-pane"],
            );

          await expect(page).toHaveScreenshot([
            capture.name,
            placement.name,
            "manager-window.png",
          ]);
          await expect(split).toHaveScreenshot([
            capture.name,
            placement.name,
            "overlay-surface.png",
          ]);
          expect(writes).toEqual([]);
        });
      }
    });
  }
});
