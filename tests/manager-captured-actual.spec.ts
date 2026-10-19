import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../src/shared/capture-profile.js";
import {
  clickThrough,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const DEV_STORYBOOK = `http://127.0.0.1:${
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
  Number(process.env.STORYBOOK_PORT ?? "9009") + 4
}`;
const STORY = "examples-interactions--with-interaction-baseline";
const HISTORICAL_RESULT = JSON.parse(
  readFileSync(
    new URL(
      "../.visual-delta/artifacts/examples/interactions/opened.result.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Record<string, unknown>;

// Synthetic presentation data only: never relabel the historical capture on disk.
async function syntheticCapturedResult(
  page: Page,
  overrides: Record<string, unknown> = {},
) {
  await page.route(
    "**/visual-delta-artifacts/examples/interactions/opened.result.json*",
    (route) =>
      route.fulfill({
        json: {
          ...HISTORICAL_RESULT,
          captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
          operationId: "synthetic-layout-comparison",
          captureOperationId: "synthetic-layout-capture",
          renderFingerprint: "synthetic-layout-fixture",
          ...overrides,
        },
      }),
  );
}

const LARGE_CAPTURED_ACTUAL_PNG = readFileSync(
  new URL(
    "./fixtures/visual-baselines/forms/task-due-calendar/shows-a-selected-date-chromium-darwin.png",
    import.meta.url,
  ),
);
const LARGE_CAPTURED_ACTUAL_HASH = createHash("sha256")
  .update(LARGE_CAPTURED_ACTUAL_PNG)
  .digest("hex");

test.describe("Captured comparison presentation", () => {
  test("shows a hydrated actual beside its baseline without mutating the project", async ({
    page,
  }) => {
    await syntheticCapturedResult(page);
    const writes = await mockVisualBackend(page);
    await openManager(
      page,
      "examples-interactions--with-interaction-baseline",
      DEV_STORYBOOK,
    );

    const panel = page.getByTestId("visual-delta-panel");
    await panel.getByRole("switch", { name: "Show captured actual" }).click();

    const preview = previewFrame(page);
    const actual = preview.locator("#visual-delta-captured-actual");
    const actualChip = preview.getByTestId("actual-image-chip");
    const baseline = preview.locator("#visual-delta-overlay > img");
    const baselineChip = preview.getByTestId("baseline-overlay-chip");
    const storyRoot = preview.locator("#storybook-root");
    await expect(actual).toBeVisible({ timeout: 15_000 });
    await expect(actualChip).toHaveText("Actual");
    await expect(actualChip).toBeVisible();
    await expect(baseline).toBeVisible();
    await expect(baselineChip).toHaveText("Baseline");
    await expect(storyRoot).toHaveCSS("visibility", "hidden");
    await expect(
      panel.getByRole("group", {
        name: "Baseline position relative to actual",
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole("switch", { name: "Baseline left of actual" }),
    ).toBeVisible();
    await expect(baselineChip).toHaveCSS(
      "background-color",
      "rgba(17, 119, 57, 0.94)",
    );
    await expect(actualChip).toHaveCSS(
      "background-color",
      "rgba(2, 97, 198, 0.92)",
    );

    const rendered = await Promise.all([
      actual.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          zoom: image.style.zoom,
        };
      }),
      baseline.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          zoom: image.style.zoom,
        };
      }),
    ]);
    expect(rendered[0]).toEqual(rendered[1]);

    await panel
      .getByRole("switch", { name: "Baseline centered over actual" })
      .click();
    await expect(actual).toBeVisible();
    await expect(actualChip).toBeVisible();
    await expect(baselineChip).toBeVisible();
    const [actualChipBox, baselineChipBox] = await Promise.all([
      actualChip.boundingBox(),
      baselineChip.boundingBox(),
    ]);
    expect(actualChipBox).not.toBeNull();
    expect(baselineChipBox).not.toBeNull();
    expect(actualChipBox!.x).toBeGreaterThan(baselineChipBox!.x);

    await panel.getByRole("switch", { name: "Show live component" }).click();
    await expect(actual).toHaveCount(0);
    await expect(actualChip).toHaveCount(0);
    await expect(storyRoot).toHaveCSS("visibility", "visible");
    expect(writes).toEqual([]);
  });

  test("fits captured comparison panes from the larger actual dimensions", async ({
    page,
  }) => {
    await syntheticCapturedResult(page, {
      capturedWidth: 3696,
      capturedHeight: 561,
      actualHash: LARGE_CAPTURED_ACTUAL_HASH,
    });
    for (const name of ["opened.actual.png", "opened.diff.png"]) {
      await page.route(
        `**/visual-delta-artifacts/examples/interactions/${name}*`,
        async (route) => {
          await route.fulfill({
            contentType: "image/png",
            body: LARGE_CAPTURED_ACTUAL_PNG,
          });
        },
      );
    }
    const writes = await mockVisualBackend(page);
    await openManager(
      page,
      "examples-interactions--with-interaction-baseline",
      DEV_STORYBOOK,
    );

    const panel = page.getByTestId("visual-delta-panel");
    await panel.getByRole("switch", { name: "Show captured actual" }).click();

    const preview = previewFrame(page);
    const actual = preview.locator("#visual-delta-captured-actual");
    const baseline = preview.locator("#visual-delta-overlay > img");
    const livePane = preview.locator("#visual-delta-live-pane");
    await expect(actual).toBeVisible({ timeout: 15_000 });
    await expect(baseline).toBeVisible();

    const dimensions = await Promise.all([
      actual.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return {
          naturalWidth: image.naturalWidth,
          width: rect.width,
          zoom: Number(image.style.zoom),
        };
      }),
      baseline.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return {
          naturalWidth: image.naturalWidth,
          width: rect.width,
          zoom: Number(image.style.zoom),
        };
      }),
      livePane.evaluate((element) => element.clientWidth),
    ]);
    expect(dimensions[0].naturalWidth).toBe(3696);
    expect(dimensions[1].naturalWidth).toBe(300);
    expect(dimensions[0].zoom).toBeLessThan(1);
    expect(dimensions[0].zoom).toBeCloseTo(dimensions[1].zoom, 6);
    expect(dimensions[0].width).toBeLessThanOrEqual(dimensions[2] + 1);
    expect(dimensions[0].width).toBeGreaterThan(dimensions[1].width);

    await panel.getByRole("switch", { name: "Show live component" }).click();
    await clickThrough(
      panel.getByRole("switch", { name: "Baseline centered over live" }),
    );
    await panel.getByRole("switch", { name: "Show captured actual" }).click();
    await expect(actual).toBeVisible();
    await expect(preview.locator("#visual-delta-split")).toHaveCount(0);
    const centered = await Promise.all([
      actual.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return { width: rect.width, zoom: Number(image.style.zoom) };
      }),
      baseline.evaluate((element) =>
        Number((element as HTMLElement).style.zoom),
      ),
      preview.locator("html").evaluate(() => window.innerWidth),
    ]);
    expect(centered[0].zoom).toBeLessThan(1);
    expect(centered[0].zoom).toBeCloseTo(centered[1], 6);
    expect(centered[0].width).toBeLessThanOrEqual(centered[2] + 1);
    expect(writes).toEqual([]);
  });

  test("keeps historical-profile captures out of the fresh actual pane", async ({
    page,
  }) => {
    expect(HISTORICAL_RESULT.captureProfile).not.toEqual(
      CANONICAL_VISUAL_CAPTURE_PROFILE,
    );
    const resultResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            "/visual-delta-artifacts/examples/interactions/opened.result.json",
          ) && response.ok(),
    );
    const writes = await mockVisualBackend(page);
    await openManager(page, STORY, DEV_STORYBOOK);
    expect((await (await resultResponse).json()).captureProfile).toEqual(
      HISTORICAL_RESULT.captureProfile,
    );
    await page
      .getByTestId("visual-delta-panel")
      .getByRole("switch", { name: "Show captured actual" })
      .click();
    const preview = previewFrame(page);
    await expect(preview.locator("#visual-delta-overlay > img")).toBeVisible();
    await expect(preview.locator("#visual-delta-captured-actual")).toHaveCount(
      0,
    );
    await expect(preview.getByTestId("actual-image-chip")).toHaveCount(0);
    expect(writes).toEqual([]);
  });
});
