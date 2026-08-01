import { expect, test } from "@playwright/test";
import {
  COMPONENT_OVERLAY_FIXTURE,
  DELAYED_OVERLAY_FIXTURE,
  FULL_VIEWPORT_MANAGER_FIXTURE,
  clickThrough,
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
    // sidebar-footer baseline (device-scale PNG at 3×)
    expectedNaturalSize: { width: 3696, height: 1440 },
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
            await clickThrough(
              panel.getByRole("switch", { name: placement.label }),
            );
          }
          const activePlacement = panel.getByRole("switch", {
            name: new RegExp(
              `(Hide overlay \\()?Baseline ${
                placement.name === "above"
                  ? "above"
                  : placement.name === "below"
                    ? "below"
                    : `${placement.name} of`
              } live\\)?`,
            ),
          });
          await expect(activePlacement).toBeChecked();

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
          const divider = frame.locator("#visual-delta-split-divider");
          await expect(divider).toBeVisible();
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
                Array.from(element.children).map((child) => child.id),
              ),
            )
            .toEqual(
              placement.baselineFirst
                ? [
                    "visual-delta-baseline-pane",
                    "visual-delta-split-divider",
                    "visual-delta-live-pane",
                  ]
                : [
                    "visual-delta-live-pane",
                    "visual-delta-split-divider",
                    "visual-delta-baseline-pane",
                  ],
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
                const overlay = chip.parentElement;
                const image = overlay?.querySelector(":scope > img");
                if (
                  !(overlay instanceof HTMLElement) ||
                  !(image instanceof HTMLImageElement)
                ) {
                  return false;
                }
                const chipRect = chip.getBoundingClientRect();
                const overlayRect = overlay.getBoundingClientRect();
                const imageRect = image.getBoundingClientRect();
                return (
                  getComputedStyle(chip).position === "absolute" &&
                  chipRect.width > 0 &&
                  chipRect.height > 0 &&
                  Math.abs(overlayRect.width - imageRect.width) <= 1 &&
                  Math.abs(overlayRect.height - imageRect.height) <= 1
                );
              }),
            )
            .toBe(true);

          const alignment = await frame.locator("body").evaluate((body) => {
            const livePane = body.querySelector("#visual-delta-live-pane");
            const baselinePane = body.querySelector(
              "#visual-delta-baseline-pane",
            );
            const subject = body.querySelector("#storybook-root > *");
            const image = body.querySelector(
              "#visual-delta-baseline-pane #visual-delta-overlay img",
            );
            if (!livePane || !baselinePane || !subject || !image) return null;
            const live = livePane.getBoundingClientRect();
            const baseline = baselinePane.getBoundingClientRect();
            const subjectRect = subject.getBoundingClientRect();
            const imageRect = image.getBoundingClientRect();
            return {
              subject: {
                left: subjectRect.left - live.left,
                top: subjectRect.top - live.top,
              },
              image: {
                left: imageRect.left - baseline.left,
                top: imageRect.top - baseline.top,
              },
            };
          });
          expect(alignment).not.toBeNull();
          if (capture.name === "component-baseline") {
            expect(
              Math.abs(alignment!.subject.left - alignment!.image.left),
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(alignment!.subject.top - alignment!.image.top),
            ).toBeLessThanOrEqual(1);
          } else {
            expect(Math.abs(alignment!.image.left)).toBeLessThanOrEqual(1);
            expect(Math.abs(alignment!.image.top)).toBeLessThanOrEqual(1);
          }

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
          const expectedScrollLeft = await horizontalRail.evaluate((rail) => {
            // A zoom transition can trigger one final ResizeObserver refresh.
            // Derive and apply the target in one preview-frame task so a stale
            // pre-refresh overflow measurement cannot be asserted afterward.
            const left = Math.min(80, rail.scrollWidth - rail.clientWidth);
            rail.scrollLeft = left;
            rail.dispatchEvent(new Event("scroll"));
            return rail.scrollLeft;
          });
          if (expectedScrollLeft > 0) {
            await expect
              .poll(
                async () => {
                  const [railLeft, liveLeft, baselineLeft] = await Promise.all([
                    horizontalRail.evaluate((rail) => rail.scrollLeft),
                    livePane.evaluate((pane) => pane.scrollLeft),
                    baselinePane.evaluate((pane) => pane.scrollLeft),
                  ]);
                  return { railLeft, liveLeft, baselineLeft };
                },
                { timeout: 10_000 },
              )
              .toEqual({
                railLeft: expectedScrollLeft,
                liveLeft: expectedScrollLeft,
                baselineLeft: expectedScrollLeft,
              });

            if (
              capture.name === "full-viewport-baseline" &&
              placement.name === "right"
            ) {
              await horizontalRail.evaluate((rail) => rail.remove());
            }
            await page.setViewportSize({ width: 880, height: 650 });
            await expect
              .poll(
                async () => {
                  const [railLeft, liveLeft, baselineLeft] = await Promise.all([
                    horizontalRail.evaluate((rail) => rail.scrollLeft),
                    livePane.evaluate((pane) => pane.scrollLeft),
                    baselinePane.evaluate((pane) => pane.scrollLeft),
                  ]);
                  return { railLeft, liveLeft, baselineLeft };
                },
                { timeout: 10_000 },
              )
              .toEqual({
                railLeft: expectedScrollLeft,
                liveLeft: expectedScrollLeft,
                baselineLeft: expectedScrollLeft,
              });
          }

          if (originalViewport) {
            await page.setViewportSize(originalViewport);
          }
          await fit.click();
          await expect(fit).toBeChecked();

          expect(writes).toEqual([]);
        });
      }

      test("center", async ({ page }) => {
        const writes = await mockVisualBackend(page);
        await openManager(page, capture.storyId);
        const panel = page.getByTestId("visual-delta-panel");
        await clickThrough(
          panel.getByRole("switch", { name: "Baseline centered over live" }),
        );

        const frame = previewFrame(page);
        const overlay = frame.locator("#visual-delta-overlay");
        const image = overlay.locator(":scope > img");
        const chip = overlay.getByTestId("baseline-overlay-chip");
        await expect(overlay).toBeVisible();
        await expect(frame.locator("#visual-delta-split")).toHaveCount(0);
        await expect(frame.locator("#visual-delta-split-divider")).toHaveCount(
          0,
        );
        await expect
          .poll(() =>
            overlay.evaluate((element) => {
              const image = element.querySelector(":scope > img");
              const chip = element.querySelector(
                '[data-testid="baseline-overlay-chip"]',
              );
              if (!image || !chip) return null;
              const overlayRect = element.getBoundingClientRect();
              const imageRect = image.getBoundingClientRect();
              const chipRect = chip.getBoundingClientRect();
              return {
                imageMatchesOverlay:
                  Math.abs(overlayRect.width - imageRect.width) <= 1 &&
                  Math.abs(overlayRect.height - imageRect.height) <= 1,
                chipInside:
                  chipRect.top >= imageRect.top - 1 &&
                  chipRect.bottom <= imageRect.bottom + 1,
              };
            }),
          )
          .toEqual({ imageMatchesOverlay: true, chipInside: true });
        await expect(image).toBeVisible();
        await expect(chip).toBeVisible();

        const delta = await frame.locator("body").evaluate((body) => {
          const subject = body.querySelector("#storybook-root > *");
          const image = body.querySelector("#visual-delta-overlay > img");
          if (!subject || !image) return null;
          const subjectRect = subject.getBoundingClientRect();
          const imageRect = image.getBoundingClientRect();
          return {
            left: imageRect.left - subjectRect.left,
            top: imageRect.top - subjectRect.top,
          };
        });
        if (capture.name === "component-baseline") {
          expect(Math.abs(delta?.left ?? Infinity)).toBeLessThanOrEqual(1);
          expect(Math.abs(delta?.top ?? Infinity)).toBeLessThanOrEqual(1);
        } else {
          const viewportDelta = await image.evaluate((element) => {
            const value = element.getBoundingClientRect();
            return { left: value.left, top: value.top };
          });
          expect(Math.abs(viewportDelta.left)).toBeLessThanOrEqual(1);
          expect(Math.abs(viewportDelta.top)).toBeLessThanOrEqual(1);
        }
        expect(writes).toEqual([]);
      });
    });
  }

  test("centers a viewport-sized canvas baseline at the viewport origin", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, "shadcn-overlays-popover--open-panel");
    const panel = page.getByTestId("visual-delta-panel");
    await clickThrough(
      panel.getByRole("switch", { name: "Baseline centered over live" }),
    );

    const frame = previewFrame(page);
    const image = frame.locator("#visual-delta-overlay > img");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, top: rect.top };
        }),
      )
      .toEqual({ left: 0, top: 0 });
    await expect(
      panel.getByRole("alert", { name: /Baseline geometry mismatch/ }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("keeps corrected viewport alignment clear after configuration repair", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, "shadcn-overlays-popover--open-panel");
    const panel = page.getByTestId("visual-delta-panel");

    await expect(
      panel.getByRole("alert", { name: /Baseline alignment mismatch/ }),
    ).toHaveCount(0);
    await panel
      .getByRole("button", { name: "More Visual Delta actions" })
      .click();
    await page
      .getByRole("button", { name: "Configuration", exact: true })
      .click();

    await expect(
      panel.getByRole("tab", { name: "Story", selected: true }),
    ).toBeVisible();
    await expect(panel.getByLabel("Story baseline alignment")).toHaveValue(
      "viewport",
    );
    await expect(
      panel.getByRole("alert", {
        name: "Story alignment configuration mismatch",
      }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("auto-selected baseline waits for storyFinished and measurement", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    const startedAt = Date.now();
    await page.goto(
      `/?path=/story/${DELAYED_OVERLAY_FIXTURE}&panel=visual-delta%2Fpanel`,
      { waitUntil: "domcontentloaded" },
    );
    const frame = previewFrame(page);
    await expect(
      frame.locator("[data-visual-delta-delayed-play]"),
    ).not.toHaveAttribute("data-visual-delta-delayed-play", "complete");
    await expect(frame.locator("#visual-delta-overlay")).toHaveCount(0);
    await expect(
      frame.locator("[data-visual-delta-delayed-play]"),
    ).toHaveAttribute("data-visual-delta-delayed-play", "complete");
    await expect(frame.locator("#visual-delta-overlay")).toBeVisible({
      timeout: 10_000,
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_000);
  });

  test("soft hide restores preview styles and measured viewport", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, COMPONENT_OVERLAY_FIXTURE);
    const frame = previewFrame(page);
    const panel = page.getByTestId("visual-delta-panel");
    const iframe = page.locator('iframe[title="storybook-preview-iframe"]');
    const beforeHide = await frame
      .locator("#storybook-root")
      .evaluate((root) => ({
        width: (root as HTMLElement).style.width,
        minWidth: (root as HTMLElement).style.minWidth,
        maxWidth: (root as HTMLElement).style.maxWidth,
        height: (root as HTMLElement).style.height,
        minHeight: (root as HTMLElement).style.minHeight,
      }));
    const iframeStyleBefore = await iframe.getAttribute("style");

    await clickThrough(
      panel.getByRole("switch", {
        name: "Hide overlay (Baseline right of live)",
      }),
    );
    await expect(frame.locator("#visual-delta-overlay")).toHaveCount(0);
    await expect(frame.locator("#visual-delta-split")).toHaveCount(0);
    await expect(frame.locator("#visual-delta-split-divider")).toHaveCount(0);

    expect(
      await frame.locator("#storybook-root").evaluate((root) => ({
        width: (root as HTMLElement).style.width,
        minWidth: (root as HTMLElement).style.minWidth,
        maxWidth: (root as HTMLElement).style.maxWidth,
        height: (root as HTMLElement).style.height,
        minHeight: (root as HTMLElement).style.minHeight,
      })),
    ).toEqual({
      width: "",
      minWidth: "",
      maxWidth: "",
      height: "",
      minHeight: beforeHide.minHeight,
    });
    expect(await iframe.getAttribute("style")).toBe(iframeStyleBefore);
  });
});
