import { expect, test } from "@playwright/test";
import {
  CUSTOM_VIEWPORT_MANAGER_FIXTURE,
  MANAGER_FIXTURE,
  NATURAL_WIDTH_COMPONENT_FIXTURE,
  OVERVIEW,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const DEV_STORYBOOK = "http://127.0.0.1:9013";

test.describe("Visual Delta manager integration", () => {
  test("reloads once after the runtime identity changes and preserves manager URL state", async ({
    page,
  }) => {
    let runtimeInstanceId = "runtime-a";
    await page.addInitScript(() => {
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
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(
            sessionStorage.getItem("visual-delta-manager-load-count") ?? "0",
          ),
        ),
      )
      .toBe(1);

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
      .toBe(2);

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
    ).toBe(2);
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
    await page.getByRole("button", { name: "Close modal" }).click();

    await page
      .getByRole("switch", { name: "Show compare view at 100%" })
      .click();
    const compareViewport = page.getByTestId("compare-scroll-viewport");
    await expect
      .poll(() =>
        compareViewport.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      )
      .toBe(true);
    await page.getByRole("tab", { name: "Diff" }).hover();
    await page.mouse.wheel(0, 240);
    await expect
      .poll(() => compareViewport.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await page.getByRole("tab", { name: "Diff" }).click();
    await page.getByRole("button", { name: "Open Diff full image" }).click();
    await expect(
      page.getByRole("dialog", { name: "Diff full image" }),
    ).toBeAttached();
    await expect(page.getByTestId("image-lightbox")).toBeVisible();
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

    const frame = previewFrame(page);
    await expect(frame.locator("#visual-delta-split")).toBeVisible();
    const dimensions = await frame
      .locator("[data-ui-component='task-due-calendar']")
      .evaluate((subject) => {
        const canvas = subject.closest("#storybook-root") as HTMLElement | null;
        return {
          subjectInlineWidth: (subject as HTMLElement).style.width,
          subjectComputedWidth: Number.parseFloat(
            getComputedStyle(subject).width,
          ),
          canvasInlineWidth: canvas?.style.width,
        };
      });

    expect(dimensions).toMatchObject({
      subjectInlineWidth: "",
      canvasInlineWidth: "1280px",
    });
    expect(dimensions.subjectComputedWidth).toBeCloseTo(264, 1);
    await expect(page.getByTestId("baseline-geometry-warning")).toContainText(
      "Baseline 1232×187 CSS px; live component 264×187 CSS px",
    );
    expect(writes).toEqual([]);
  });
});
