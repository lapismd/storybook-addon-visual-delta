import { expect, test } from "@playwright/test";
import {
  COMPONENT_OVERLAY_FIXTURE,
  FULL_VIEWPORT_MANAGER_FIXTURE,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const CAPTURE_KINDS = [
  {
    name: "component-baseline",
    storyId: COMPONENT_OVERLAY_FIXTURE,
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
          const livePane = frame.locator("#visual-delta-live-pane");
          const baselinePane = frame.locator("#visual-delta-baseline-pane");
          const baselineImage = frame.locator(
            "#visual-delta-baseline-pane #visual-delta-overlay img",
          );
          const baselineChip = frame.getByTestId("baseline-overlay-chip");
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

          const fit = panel.getByRole("switch", {
            name: /Fit split comparison/,
          });
          await expect(fit).toBeChecked();
          const fitGeometry = await frame.locator("body").evaluate(() => {
            const live = document.getElementById("visual-delta-live-pane");
            const baseline = document.getElementById(
              "visual-delta-baseline-pane",
            );
            const subject = document.querySelector("#storybook-root > *");
            const image = document.querySelector(
              "#visual-delta-baseline-pane #visual-delta-overlay img",
            );
            if (!live || !baseline || !subject || !image) return null;
            const rect = (element: Element) => {
              const value = element.getBoundingClientRect();
              return {
                left: value.left,
                top: value.top,
                right: value.right,
                bottom: value.bottom,
                width: value.width,
                height: value.height,
              };
            };
            const within = (
              child: ReturnType<typeof rect>,
              parent: ReturnType<typeof rect>,
            ) =>
              child.left >= parent.left - 1 &&
              child.top >= parent.top - 1 &&
              child.right <= parent.right + 1 &&
              child.bottom <= parent.bottom + 1;
            const liveRect = rect(live);
            const baselineRect = rect(baseline);
            const subjectRect = rect(subject);
            const imageRect = rect(image);
            return {
              liveWithin: within(subjectRect, liveRect),
              baselineWithin: within(imageRect, baselineRect),
              liveRect,
              baselineRect,
              subjectRect,
              imageRect,
            };
          });
          if (!fitGeometry?.liveWithin || !fitGeometry.baselineWithin) {
            throw new Error(
              `Fit comparison overflowed its pane: ${JSON.stringify(fitGeometry)}`,
            );
          }
          await expect
            .poll(() =>
              baselineChip.evaluate((chip) => {
                const image = chip.parentElement?.querySelector(":scope > img");
                if (!(image instanceof HTMLImageElement)) return false;
                return (
                  chip.getBoundingClientRect().bottom <=
                  image.getBoundingClientRect().top + 1
                );
              }),
            )
            .toBe(true);

          const originalViewport = page.viewportSize();
          await page.setViewportSize({ width: 900, height: 650 });
          await expect
            .poll(() =>
              baselineImage.evaluate(
                (image: HTMLImageElement) =>
                  Number.parseFloat(image.style.zoom || "1") < 1,
              ),
            )
            .toBe(true);

          await panel
            .getByRole("switch", {
              name: "Show split comparison at 100%",
            })
            .click();
          await expect
            .poll(() =>
              baselineImage.evaluate((image: HTMLImageElement) =>
                Number.parseFloat(image.style.zoom || "1"),
              ),
            )
            .toBe(1);

          const horizontalRail = frame.locator("#visual-delta-scroll-rail-h");
          await expect(horizontalRail).toBeVisible();
          await horizontalRail.evaluate((rail) => {
            rail.scrollLeft = 80;
            rail.dispatchEvent(new Event("scroll"));
          });
          await expect
            .poll(async () => {
              const [liveLeft, baselineLeft] = await Promise.all([
                livePane.evaluate((pane) => pane.scrollLeft),
                baselinePane.evaluate((pane) => pane.scrollLeft),
              ]);
              return { liveLeft, baselineLeft };
            })
            .toEqual({ liveLeft: 80, baselineLeft: 80 });

          if (originalViewport) {
            await page.setViewportSize(originalViewport);
          }
          await fit.click();
          await expect(fit).toBeChecked();

          expect(writes).toEqual([]);
        });
      }
    });
  }
});
