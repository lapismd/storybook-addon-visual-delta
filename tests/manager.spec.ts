import { expect, test } from "@playwright/test";
import {
  COMPONENT_OVERLAY_FIXTURE,
  CUSTOM_VIEWPORT_MANAGER_FIXTURE,
  MANAGER_FIXTURE,
  NATURAL_WIDTH_COMPONENT_FIXTURE,
  OVERVIEW,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const DEV_STORYBOOK = `http://127.0.0.1:${
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
  Number(process.env.STORYBOOK_PORT ?? "9009") + 4
}`;

test.describe("Visual Delta manager integration", () => {
  test("panel review actions ignore Testing Module preferences and baseline updates stay story-scoped", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      for (const key of [
        "storybook-addon-visual-delta/run-visual-enabled-v1",
        "storybook-addon-visual-delta/create-baselines-enabled-v1",
        "storybook-addon-visual-delta/update-status-enabled-v1",
        "storybook-addon-visual-delta/affected-only-enabled-v1",
      ]) {
        localStorage.setItem(key, "0");
      }
      localStorage.setItem(
        "storybook-addon-visual-delta/accept-scope-v1",
        "story",
      );
    });
    const reviewBodies: unknown[] = [];
    const baselineBodies: unknown[] = [];
    const deleteBodies: unknown[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/review-status")) {
        reviewBodies.push(request.postDataJSON());
      }
      if (pathname.endsWith("/update-baseline")) {
        baselineBodies.push(request.postDataJSON());
      }
      if (pathname.endsWith("/delete-baseline")) {
        deleteBodies.push(request.postDataJSON());
      }
    });
    await mockVisualBackend(page);
    await openManager(page, COMPONENT_OVERLAY_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    await panel
      .getByRole("button", { name: "Accept story", exact: true })
      .click();
    await expect.poll(() => reviewBodies.length).toBe(1);
    expect(reviewBodies[0]).toEqual({
      updates: [{ storyId: COMPONENT_OVERLAY_FIXTURE, status: "approved" }],
    });

    await panel
      .getByRole("button", { name: "Unaccept story", exact: true })
      .click();
    await expect.poll(() => reviewBodies.length).toBe(2);
    expect(reviewBodies[1]).toEqual({
      updates: [{ storyId: COMPONENT_OVERLAY_FIXTURE, status: "pending" }],
    });

    await panel
      .getByRole("switch", {
        name: "Mark visual baseline ready for review",
      })
      .click();
    await panel
      .getByRole("switch", { name: "Mark visual baseline failed" })
      .click();
    await expect.poll(() => reviewBodies.length).toBe(4);
    expect(reviewBodies.slice(2)).toEqual([
      { storyId: COMPONENT_OVERLAY_FIXTURE, status: "ready" },
      { storyId: COMPONENT_OVERLAY_FIXTURE, status: "failed" },
    ]);

    await panel
      .getByRole("button", { name: "More Visual Delta actions" })
      .click();
    await expect(
      page.getByRole("button", { name: "Rebuild storybook static" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update baselines" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await panel
      .getByRole("button", { name: "More Default baseline actions" })
      .click();
    await page.getByRole("button", { name: "Update Default baseline" }).click();
    await expect.poll(() => baselineBodies.length).toBe(1);
    expect(baselineBodies[0]).toEqual({
      storyId: COMPONENT_OVERLAY_FIXTURE,
    });

    await panel
      .getByRole("button", { name: "More Default baseline actions" })
      .click();
    await page
      .getByRole("button", { name: "Delete Default screenshot" })
      .click();
    await expect.poll(() => deleteBodies.length).toBe(1);
    expect(deleteBodies[0]).toEqual({
      storyId: COMPONENT_OVERLAY_FIXTURE,
      baselineUrl:
        "/visual-baselines/shadcn/button/default-chromium-darwin.png",
    });
  });

  test("Story and Diff Chromium use the same live exact-story contract without static work", async ({
    page,
  }) => {
    const compareBodies: unknown[] = [];
    const staticRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/compare-story")) {
        compareBodies.push(request.postDataJSON());
      }
      if (
        pathname.endsWith("/run-tests") ||
        pathname.endsWith("/rebuild-static")
      ) {
        staticRequests.push(pathname);
      }
    });
    await mockVisualBackend(page);
    await openManager(page, COMPONENT_OVERLAY_FIXTURE, DEV_STORYBOOK);

    await page
      .getByRole("button", { name: "Choose Diff HTML or Diff Chromium" })
      .click();
    await page
      .getByRole("button", { name: "Diff Chromium", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /Compare via Playwright Chromium screenshot/,
      })
      .click();
    await expect.poll(() => compareBodies.length).toBe(1);

    await page
      .getByRole("button", { name: "Run visual test for this story" })
      .click();
    await expect.poll(() => compareBodies.length).toBe(2);

    expect(compareBodies[1]).toEqual(compareBodies[0]);
    expect(staticRequests).toEqual([]);
  });

  test("reloads once after the runtime identity changes and preserves manager URL state", async ({
    page,
  }) => {
    let runtimeInstanceId = "runtime-a";
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const key = "visual-delta-manager-load-count";
      const next = Number(sessionStorage.getItem(key) ?? "0") + 1;
      sessionStorage.setItem(key, String(next));
    });
    await mockVisualBackend(page, {
      runtimeInstanceId: () => runtimeInstanceId,
    });
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);

    const initialUrl = new URL(page.url());
    expect(initialUrl.searchParams.get("path")).toBe(
      `/story/${MANAGER_FIXTURE}`,
    );
    const initialManagerLocation = await page.evaluate(
      () => location.pathname + location.search + location.hash,
    );
    await expect(
      page.getByRole("tabpanel", { name: "Visual Delta" }),
    ).toBeVisible();
    const initialLoadCount = await page.evaluate(() =>
      Number(sessionStorage.getItem("visual-delta-manager-load-count") ?? "0"),
    );
    expect(initialLoadCount).toBeGreaterThan(0);

    runtimeInstanceId = "runtime-b";
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(
              sessionStorage.getItem("visual-delta-manager-load-count") ?? "0",
            ),
          ),
        { timeout: 5_000 },
      )
      .toBe(initialLoadCount + 1);

    expect(
      await page.evaluate(
        () => location.pathname + location.search + location.hash,
      ),
    ).toBe(initialManagerLocation);
    await expect(page).toHaveURL(new RegExp(`path=/story/${MANAGER_FIXTURE}`));
    await expect(
      page.getByRole("tabpanel", { name: "Visual Delta" }),
    ).toBeVisible();

    // The new page seeds runtime-b, so a subsequent poll must not reload again.
    await page.waitForTimeout(1_250);
    expect(
      await page.evaluate(() =>
        Number(
          sessionStorage.getItem("visual-delta-manager-load-count") ?? "0",
        ),
      ),
    ).toBe(initialLoadCount + 1);
  });

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

  test("opens VCS history for primary, mode, and interaction baselines", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);
    const panel = page.getByTestId("visual-delta-panel");

    await panel
      .getByRole("button", { name: "More Default baseline actions" })
      .click();
    await page
      .getByRole("button", { name: "Open Default baseline history" })
      .click();
    await expect(
      panel.getByRole("heading", { name: "Default history" }),
    ).toBeVisible();
    await expect(panel.getByTitle("History provided by jj")).toBeVisible();
    await expect(
      panel.getByRole("heading", {
        name: "Component diff About component diff",
      }),
    ).toBeVisible();
    await expect(
      panel.getByText('+ <button class="comfortable">'),
    ).toBeVisible();
    await expect(panel.getByRole("tab", { name: "2-up" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await panel.getByRole("button", { name: "Back to baseline" }).click();

    await page
      .getByRole("button", {
        name: "Visual mode: Default, not run",
      })
      .click();
    await page
      .getByRole("button", { name: "Dark desktop mode, not run" })
      .click();
    await panel
      .getByRole("button", { name: "More Default baseline actions" })
      .click();
    await page
      .getByRole("button", {
        name: "Open Default · Dark desktop baseline history",
      })
      .click();
    await expect(
      panel.getByRole("heading", { name: "Default · Dark desktop history" }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Back to baseline" }).click();

    await panel
      .getByRole("button", {
        name: "Opened state Baseline wired · opened-state",
        exact: true,
      })
      .click();
    await panel
      .getByRole("button", {
        name: "More Opened state baseline actions",
      })
      .click();
    await page
      .getByRole("button", {
        name: "Open Opened state baseline history",
      })
      .click();
    await expect(
      panel.getByRole("heading", { name: "Opened state history" }),
    ).toBeVisible();
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

    await page
      .getByRole("button", { name: "Open Default baseline full image" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Default baseline full image" }),
    ).toBeAttached();
    await expect(page.getByTestId("image-lightbox")).toBeVisible();
    await expect(page.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    await page.getByRole("button", { name: "Close modal" }).click();

    await expect(page.getByLabel(/Visual compare/)).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    const baselinePane = page.getByTestId("compare-baseline-scroll");
    const newPane = page.getByTestId("compare-new-scroll");
    await expect(baselinePane).toBeVisible();
    await expect(newPane).toBeVisible();
    await expect
      .poll(async () => {
        const [baselineWidth, newWidth] = await Promise.all([
          baselinePane.evaluate((element) => element.clientWidth),
          newPane.evaluate((element) => element.clientWidth),
        ]);
        return Math.abs(baselineWidth - newWidth);
      })
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() =>
        baselinePane.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      )
      .toBe(true);
    const sharedLeft = await baselinePane.evaluate((element) => {
      const next = Math.min(80, element.scrollWidth - element.clientWidth);
      element.scrollLeft = next;
      element.dispatchEvent(new Event("scroll"));
      return next;
    });
    await expect
      .poll(() => newPane.evaluate((element) => element.scrollLeft))
      .toBe(sharedLeft);
    await expect
      .poll(() =>
        page
          .getByTestId("compare-shared-scroll-x")
          .evaluate((element) => element.scrollLeft),
      )
      .toBe(sharedLeft);

    await page.getByRole("tab", { name: "Diff" }).click();
    const compareViewport = page.getByTestId("compare-scroll-viewport");
    await expect
      .poll(() =>
        compareViewport.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).minHeight),
        ),
      )
      .toBeGreaterThanOrEqual(300);

    await page.getByRole("button", { name: "Open Diff full image" }).click();
    await expect(
      page.getByRole("dialog", { name: "Diff full image" }),
    ).toBeAttached();
    await expect(page.getByTestId("image-lightbox")).toBeVisible();
    await expect(page.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    await page.getByRole("switch", { name: "Show full image at 100%" }).click();
    await expect
      .poll(() =>
        page
          .getByTestId("image-lightbox-viewport")
          .evaluate((element) => element.scrollWidth > element.clientWidth),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Close modal" }).click();
    expect(writes).toEqual([]);
  });

  test("keeps a max-width component natural inside the capture viewport", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, NATURAL_WIDTH_COMPONENT_FIXTURE, DEV_STORYBOOK);

    const baselineRight = page.getByRole("switch", {
      name: "Baseline right of live",
    });
    if ((await baselineRight.getAttribute("aria-checked")) !== "true") {
      await baselineRight.click();
    }
    const frame = previewFrame(page);
    await expect
      .poll(
        () =>
          frame.locator("body").evaluate((body) => {
            const split = body.querySelector("#visual-delta-split");
            const subject = body.querySelector(
              "[data-ui-component='task-due-calendar']",
            );
            const canvas = subject?.closest(
              "#storybook-root",
            ) as HTMLElement | null;
            if (!(subject instanceof HTMLElement)) return null;
            return {
              splitVisible: split instanceof HTMLElement && !split.hidden,
              subjectInlineWidth: subject.style.width,
              subjectComputedWidth: Math.round(
                Number.parseFloat(getComputedStyle(subject).width),
              ),
              canvasInlineWidth: canvas?.style.width,
            };
          }),
        { timeout: 15_000 },
      )
      .toMatchObject({
        splitVisible: true,
        subjectInlineWidth: "",
        subjectComputedWidth: 264,
        canvasInlineWidth: "1280px",
      });
    await expect(page.getByTestId("baseline-geometry-warning")).toContainText(
      "Baseline 1232×187 CSS px; live component 264×187 CSS px",
    );
    await expect(frame.locator("#visual-delta-overlay > img")).toBeVisible({
      timeout: 15_000,
    });

    const toolbarBaseline = page.getByRole("button", {
      name: "Open Default baseline full image",
    });
    const previewSizes = await Promise.all([
      toolbarBaseline.locator("img").evaluate((image) => {
        const rect = image.getBoundingClientRect();
        return {
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
        };
      }),
      frame.locator("#visual-delta-overlay > img").evaluate((image) => {
        const rect = image.getBoundingClientRect();
        return {
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
        };
      }),
    ]);
    for (const size of previewSizes) {
      expect(size.renderedWidth / size.renderedHeight).toBeCloseTo(
        size.naturalWidth / size.naturalHeight,
        2,
      );
    }

    await toolbarBaseline.click();
    const fullImage = page.getByRole("img", {
      name: "Default baseline full image",
    });
    await expect(fullImage).toBeVisible();
    await expect
      .poll(() =>
        fullImage.evaluate((image) => {
          const rect = image.getBoundingClientRect();
          const style = getComputedStyle(image);
          const cssWidth = Number.parseFloat(style.width);
          const cssHeight = Number.parseFloat(style.height);
          return (
            image.naturalWidth > 0 &&
            image.naturalHeight > 0 &&
            Math.abs(cssWidth - image.naturalWidth / 3) < 0.1 &&
            Math.abs(cssHeight - image.naturalHeight / 3) < 0.1 &&
            Math.abs(
              rect.width / rect.height -
                image.naturalWidth / image.naturalHeight,
            ) < 0.01
          );
        }),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Close modal" }).click();
    expect(writes).toEqual([]);
  });
});
