import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SETTINGS_STORAGE_KEY } from "../src/panel/settings.js";
import {
  AI_SEND_BUTTON_STATES,
  COMPONENT_OVERLAY_FIXTURE,
  CUSTOM_VIEWPORT_MANAGER_FIXTURE,
  DELAYED_MISSING_BASELINE_FIXTURE,
  MANAGER_FIXTURE,
  NATURAL_WIDTH_COMPONENT_FIXTURE,
  OVERVIEW,
  RESPONSIVE_CANVAS_FIT_FIXTURE,
  clickThrough,
  mockVisualBackend,
  openManager,
  previewFrame,
} from "./manager-test-support.js";

const DEV_STORYBOOK = `http://127.0.0.1:${
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
  Number(process.env.STORYBOOK_PORT ?? "9009") + 4
}`;
const DIALOG_INTERACTION_FIXTURE = "shadcn-overlays-dialog--opens-and-closes";
const FILTER_INTERACTION_FIXTURE =
  "filter-power-search--add-filter-via-combobox";
const FILTER_MISSING_FIXTURE = "filter-power-search--edit-remove-and-clear";
const EXAMPLE_DIFFERENCE_FIXTURE =
  "examples-card--intentional-difference";
const EXAMPLE_MODES_FIXTURE = "examples-modes--default-and-compact";
const FIXTURE_BASELINE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const LARGE_CAPTURED_ACTUAL_PNG = readFileSync(
  new URL(
    "./fixtures/visual-baselines/forms/task-due-calendar/shows-a-selected-date-chromium-darwin.png",
    import.meta.url,
  ),
);
const LARGE_CAPTURED_ACTUAL_HASH = createHash("sha256")
  .update(LARGE_CAPTURED_ACTUAL_PNG)
  .digest("hex");

test.describe("Visual Delta manager integration", () => {
  test("surfaces the canonical profile and configured browser", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, COMPONENT_OVERLAY_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    const environment = panel.getByRole("group", {
      name: "Visual baseline target",
    });
    await expect(
      environment.getByLabel("Canonical capture profile: Linux ARM64"),
    ).toContainText("Linux · ARM64");
    const controls = environment.getByRole("button");
    await expect(controls).toHaveCount(1);
    await expect(controls.nth(0)).toHaveAccessibleName(
      "Visual baseline browser",
    );
    await expect(controls.nth(0)).toContainText("Chromium");

    await controls.nth(0).click();
    await page.getByRole("button", { name: "Firefox", exact: true }).click();
    await expect(controls.nth(0)).toContainText("Firefox");
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible();
    await expect(
      previewFrame(page).getByText("Baseline", { exact: true }),
    ).toHaveCount(0);
  });

  test("keeps the canonical profile fixed when browser coverage is missing", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    const target = panel.getByRole("group", {
      name: "Visual baseline target",
    });
    await target
      .getByRole("button", { name: "Visual baseline browser" })
      .click();
    await page.getByRole("button", { name: "Firefox", exact: true }).click();
    await expect(
      target.getByLabel("Canonical capture profile: Linux ARM64"),
    ).toContainText("Linux · ARM64");
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible();
    await expect(
      previewFrame(page).getByText("Baseline", { exact: true }),
    ).toHaveCount(0);
  });

  test("keeps explicit demo coverage aligned with the displayed overlay", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, EXAMPLE_DIFFERENCE_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("status", { name: /Baseline ready/i }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Create .*baseline/i }),
    ).toHaveCount(0);
    await expect(
      previewFrame(page).locator(
        'img[src^="/visual-baselines/examples/card/drift.png"]',
      ),
    ).toBeVisible();
  });

  test("keeps a delayed missing baseline provisional until storyFinished", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, DELAYED_MISSING_BASELINE_FIXTURE, DEV_STORYBOOK);

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

    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible({ timeout: 10_000 });
    const createDefault = panel.getByRole("button", {
      name: "Create Default baseline",
    });
    await expect(createDefault).toBeVisible();
    await expect(createDefault).toBeEnabled();
    await expect(
      panel.getByRole("button", { name: /Create .*baseline/i }),
    ).not.toHaveCount(0);
  });

  test("restores exact readiness after a same-story controls rerender", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, FILTER_MISSING_FIXTURE, DEV_STORYBOOK);

    const previewRoot = previewFrame(page).locator("html");
    await expect(previewRoot).toHaveAttribute(
      "data-visual-delta-story-finished",
      FILTER_MISSING_FIXTURE,
      { timeout: 45_000 },
    );

    await page.getByRole("tab", { name: /Controls/ }).click();
    const placeholderRow = page.getByRole("row", { name: /placeholder/i });
    const placeholderInput = placeholderRow.getByRole("textbox");
    await placeholderInput.fill("Filter fields");
    await placeholderInput.press("Enter");

    await expect(previewRoot).toHaveAttribute(
      "data-visual-delta-story-finished",
      FILTER_MISSING_FIXTURE,
      { timeout: 10_000 },
    );

    await page.getByRole("tab", { name: "Visual Delta" }).click();
    await expect(
      page
        .getByTestId("visual-delta-panel")
        .getByText("Loading story…", { exact: true }),
    ).toHaveCount(0);
  });

  test("treats a deleted baseline PNG as missing and offers create or skip", async ({
    page,
  }) => {
    await page.route(
      "**/visual-baselines/shadcn/button/default-chromium-darwin.png*",
      async (route) => {
        await route.fulfill({ status: 404, body: "baseline deleted" });
      },
    );
    await mockVisualBackend(page);
    await openManager(page, COMPONENT_OVERLAY_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Create visual baseline" }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Create Default baseline" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Skip visual tests" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Open Default baseline full image" }),
    ).toHaveCount(0);
    await expect(
      panel.locator('img[src*="default-chromium-darwin.png"]'),
    ).toHaveCount(0);
  });

  test("requires an explicit target when a missing story has multiple interactions", async ({
    page,
  }) => {
    const interactionBodies: unknown[] = [];
    await page.route(
      "**/visual-baselines/shadcn/dialog/*.png*",
      async (route) => {
        await route.fulfill({ status: 404, body: "baseline deleted" });
      },
    );
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.endsWith("/create-interaction-baseline")
      ) {
        interactionBodies.push(request.postDataJSON());
      }
    });
    await mockVisualBackend(page);
    await openManager(page, DIALOG_INTERACTION_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("button", { name: "Create visual baseline" }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Create Default baseline" }),
    ).toBeVisible();
    await expect(
      panel
        .getByRole("button", {
          name: /Create userEvent\.click.*interaction-1-click/,
        })
        .first(),
    ).toBeVisible();

    await panel
      .getByRole("button", {
        name: /Create userEvent\.click.*interaction-1-click/,
      })
      .click();

    await expect.poll(() => interactionBodies.length).toBe(1);
    expect(interactionBodies[0]).toMatchObject({
      storyId: DIALOG_INTERACTION_FIXTURE,
      stepLabel: "userEvent.click",
      stepId: "interaction-1-click",
      overwrite: false,
    });
    expect([undefined, `${DIALOG_INTERACTION_FIXTURE} [1] click`]).toContain(
      (interactionBodies[0] as { captureCallId?: string }).captureCallId,
    );
  });

  test("hydrates a nested filter baseline after an explicit accordion choice", async ({
    page,
  }) => {
    let baselineCreated = false;
    const baselineUrl =
      "/visual-baselines/filter/power-search/add-filter-via-combobox-chromium-darwin.png";
    await page.route(`**${baselineUrl}*`, async (route) => {
      if (!baselineCreated) {
        await route.fulfill({ status: 404, body: "baseline missing" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: FIXTURE_BASELINE_PNG,
      });
    });
    await mockVisualBackend(page);
    await page.route("**/__visual-delta/create-baseline", async (route) => {
      baselineCreated = true;
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "[exit 0]\nStory visualDelta patch: 1 updated, 0 already wired\n",
      });
    });

    await page.goto(
      `${DEV_STORYBOOK}/?path=/story/${FILTER_INTERACTION_FIXTURE}`,
      { waitUntil: "networkidle" },
    );
    await expect(
      page.getByRole("tab", { name: /^Interactions \d+$/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Visual Delta" }).click();

    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible();
    const createPrimary = panel
      .getByRole("button", { name: /Create (Default|visual) baseline/ })
      .first();
    await expect(createPrimary).toBeVisible();

    await clickThrough(createPrimary);

    await expect(
      panel.getByRole("status", { name: /Baseline created|Baseline ready/i }),
    ).toBeVisible();
    await expect
      .poll(() => baselineCreated)
      .toBe(true);
    await expect(
      panel.getByRole("button", { name: "Create Default baseline" }),
    ).toHaveCount(0);
  });

  test("keeps baseline-write progress and hydration on the originating story", async ({
    page,
  }) => {
    const sourceBaselineUrl =
      "/visual-baselines/filter/power-search/add-filter-via-combobox-chromium-darwin.png";
    const destinationBaselineUrl =
      "/visual-baselines/filter/power-search/edit-remove-and-clear-chromium-darwin.png";
    let sourceBaselineCreated = false;
    let releaseCreate: (() => void) | undefined;
    let markCreateStarted: (() => void) | undefined;
    const createStarted = new Promise<void>((resolve) => {
      markCreateStarted = resolve;
    });
    const createCanFinish = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });

    await page.route(`**${sourceBaselineUrl}*`, async (route) => {
      if (!sourceBaselineCreated) {
        await route.fulfill({ status: 404, body: "baseline missing" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: FIXTURE_BASELINE_PNG,
      });
    });
    await page.route(`**${destinationBaselineUrl}*`, async (route) => {
      await route.fulfill({ status: 404, body: "baseline missing" });
    });
    await mockVisualBackend(page);
    await page.route("**/__visual-delta/create-baseline", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        storyId: FILTER_INTERACTION_FIXTURE,
      });
      markCreateStarted?.();
      await createCanFinish;
      sourceBaselineCreated = true;
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "[exit 0]\nStory visualDelta patch: 1 updated, 0 already wired\n",
      });
    });

    await openManager(page, FILTER_INTERACTION_FIXTURE, DEV_STORYBOOK);
    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible();
    const createPrimary = panel
      .getByRole("button", { name: /Create (Default|visual) baseline/ })
      .first();
    await expect(createPrimary).toBeVisible();
    await clickThrough(createPrimary);
    await createStarted;
    await expect(panel.getByRole("progressbar")).toBeVisible();

    await page
      .locator(`a[href="/?path=/story/${FILTER_MISSING_FIXTURE}"]`)
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/story/${FILTER_MISSING_FIXTURE}`),
    );
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole("progressbar")).toHaveCount(0);

    const createResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        "/__visual-delta/create-baseline",
      ),
    );
    releaseCreate?.();
    await createResponse;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(
      panel.getByRole("status", { name: /Baseline missing/i }),
    ).toBeVisible();
    await expect(
      panel.locator(`img[src*="${destinationBaselineUrl}"]`),
    ).toHaveCount(0);
    await expect(panel.getByRole("progressbar")).toHaveCount(0);
  });

  test("never exposes missing-baseline actions for an explicit AI baseline across refresh and remount", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ storyId }) => {
        if (window !== window.top) return;
        const storageKey = "visual-delta-readiness-flashes";
        sessionStorage.setItem(storageKey, "[]");
        const recordFalseState = () => {
          if (!location.search.includes(storyId)) return;
          const text = document.body?.innerText ?? "";
          const create = document.querySelector(
            'button[aria-label="Create visual baseline"]',
          );
          if (!text.includes("Baseline missing") && !create) return;
          const flashes = JSON.parse(
            sessionStorage.getItem(storageKey) ?? "[]",
          ) as number[];
          flashes.push(Date.now());
          sessionStorage.setItem(storageKey, JSON.stringify(flashes));
        };
        const observe = () => {
          if (!document.body) return;
          new MutationObserver(recordFalseState).observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          recordFalseState();
        };
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", observe, {
            once: true,
          });
        } else {
          observe();
        }
      },
      { storyId: AI_SEND_BUTTON_STATES },
    );
    await mockVisualBackend(page);
    await openManager(page, AI_SEND_BUTTON_STATES, DEV_STORYBOOK);

    const baselineButton = page.getByRole("button", {
      name: "Open Default baseline full image",
    });
    await expect(baselineButton).toBeVisible({ timeout: 45_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    const visualDeltaTab = page.getByRole("tab", { name: "Visual Delta" });
    await expect(visualDeltaTab).toBeVisible();
    if ((await visualDeltaTab.getAttribute("aria-selected")) !== "true") {
      await visualDeltaTab.click();
    }
    await expect(baselineButton).toBeVisible({ timeout: 45_000 });
    expect(
      await page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("visual-delta-readiness-flashes") ?? "[]",
        ),
      ),
    ).toEqual([]);

    await page.evaluate(() => {
      sessionStorage.setItem("visual-delta-readiness-flashes", "[]");
      const iframe = document.querySelector(
        'iframe[title="storybook-preview-iframe"]',
      );
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentWindow) {
        throw new Error("Storybook preview iframe is unavailable");
      }
      iframe.contentWindow.location.reload();
    });
    await expect(baselineButton).toBeVisible({ timeout: 45_000 });
    await expect(previewFrame(page).locator("html")).toHaveAttribute(
      "data-visual-delta-story-finished",
      AI_SEND_BUTTON_STATES,
      { timeout: 45_000 },
    );
    expect(
      await page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("visual-delta-readiness-flashes") ?? "[]",
        ),
      ),
    ).toEqual([]);
  });

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
    await page.route("**/__visual-delta/update-baseline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "[exit 0]\nUpdated\n",
      });
    });
    await page.route("**/__visual-delta/delete-baseline", async (route) => {
      await route.fulfill({ status: 200, json: { ok: true } });
    });
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

    const moreDefault = () =>
      panel.getByRole("button", { name: "More Default baseline actions" });
    await moreDefault().click();
    const deleteBaseline = page.getByRole("button", {
      name: /Delete Default screenshot/,
    });
    await expect(deleteBaseline).toBeVisible();
    await page.getByRole("button", { name: "Update Default baseline" }).click();
    await expect.poll(() => baselineBodies.length).toBe(1);
    expect(baselineBodies[0]).toEqual({
      storyId: COMPONENT_OVERLAY_FIXTURE,
      browser: "chromium",
    });

    // Delete while the primary baseline is still present (before update can
    // clear wired state under the mock writer).
    await expect(moreDefault()).toBeVisible();
    await moreDefault().click();
    if ((await deleteBaseline.count()) === 0) {
      await page.keyboard.press("Escape");
      await openManager(page, COMPONENT_OVERLAY_FIXTURE, DEV_STORYBOOK);
      await moreDefault().click();
    }
    await expect(deleteBaseline).toBeVisible();
    await deleteBaseline.click();
    await expect.poll(() => deleteBodies.length).toBe(1);
    expect(deleteBodies[0]).toEqual({
      storyId: COMPONENT_OVERLAY_FIXTURE,
      baselineUrl:
        "/visual-baselines/shadcn/button/default-chromium-darwin.png",
    });
  });

  test("Story and Diff Browser submit the same runner-backed exact-story request", async ({
    page,
  }) => {
    const compareBodies: unknown[] = [];
    const unrelatedRunRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/compare-story")) {
        compareBodies.push(request.postDataJSON());
      }
      if (
        pathname.endsWith("/run-tests") ||
        pathname.endsWith("/rebuild-static")
      ) {
        unrelatedRunRequests.push(pathname);
      }
    });
    await mockVisualBackend(page);
    await openManager(page, COMPONENT_OVERLAY_FIXTURE, DEV_STORYBOOK);

    await page
      .getByRole("button", { name: "Choose Diff HTML or Diff Browser" })
      .click();
    await page
      .getByRole("button", { name: "Diff Browser", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /Compare via the selected Playwright browser/,
      })
      .click();
    await expect.poll(() => compareBodies.length).toBe(1);
    const comparisonLog = page.getByRole("button", {
      name: /Log: Visual: 1 passed \(story\)/,
    });
    await expect(comparisonLog).toBeVisible();
    await comparisonLog.click();
    await expect(
      page.getByRole("dialog", {
        name: /Log: Visual: 1 passed \(story\)/,
      }),
    ).toContainText("Installing clean Linux/ARM64 workspace…");
    await page.keyboard.press("Escape");

    await page
      .getByRole("button", { name: "Run visual test for this story" })
      .click();
    await expect.poll(() => compareBodies.length).toBe(2);

    expect(compareBodies[1]).toEqual(compareBodies[0]);
    expect(unrelatedRunRequests).toEqual([]);
  });

  test("Diff Browser sends the explicit browser target for an unqualified teaching baseline", async ({
    page,
  }) => {
    const compareBodies: Array<Record<string, unknown>> = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/compare-story")) {
        compareBodies.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
    await mockVisualBackend(page);
    await openManager(
      page,
      "examples-gallery--compact-variant",
      DEV_STORYBOOK,
    );

    await page
      .getByRole("button", { name: "Choose Diff HTML or Diff Browser" })
      .click();
    await page
      .getByRole("button", { name: "Diff Browser", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /Compare via the selected Playwright browser/,
      })
      .click();
    await expect.poll(() => compareBodies.length).toBe(1);

    expect(compareBodies[0]).toMatchObject({
      storyId: "examples-gallery--compact-variant",
      baselineUrl: "/visual-baselines/examples/gallery/compact.png",
      browser: "chromium",
      target: { browser: "chromium" },
    });
  });

  test("keeps non-canonical teaching baselines compare-only", async ({ page }) => {
    await mockVisualBackend(page);
    await openManager(
      page,
      "examples-interactions--with-interaction-baseline",
      DEV_STORYBOOK,
    );

    const panel = page.getByTestId("visual-delta-panel");
    await panel
      .getByRole("button", { name: "More Default baseline actions" })
      .click();
    await expect(
      page.getByRole("button", { name: "Update Default baseline" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete Default screenshot" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      panel.getByRole("button", {
        name: "Choose Diff HTML or Diff Browser",
      }),
    ).toBeVisible();
  });

  test("shows a hydrated actual beside its baseline without mutating the project", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(
      page,
      "examples-interactions--with-interaction-baseline",
      DEV_STORYBOOK,
    );

    const panel = page.getByTestId("visual-delta-panel");
    await panel
      .getByRole("switch", { name: "Show captured actual" })
      .click();

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
        return { width: rect.width, height: rect.height, zoom: image.style.zoom };
      }),
      baseline.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return { width: rect.width, height: rect.height, zoom: image.style.zoom };
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
    await page.route(
      "**/visual-delta-artifacts/examples/interactions/opened.result.json*",
      async (route) => {
        const response = await route.fetch();
        const sidecar = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: {
            ...sidecar,
            capturedWidth: 3696,
            capturedHeight: 561,
            actualHash: LARGE_CAPTURED_ACTUAL_HASH,
          },
        });
      },
    );
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
    await panel
      .getByRole("switch", { name: "Show captured actual" })
      .click();

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
    await panel
      .getByRole("switch", { name: "Show captured actual" })
      .click();
    await expect(actual).toBeVisible();
    await expect(preview.locator("#visual-delta-split")).toHaveCount(0);
    const centered = await Promise.all([
      actual.evaluate((element) => {
        const image = element as HTMLImageElement;
        const rect = image.getBoundingClientRect();
        return { width: rect.width, zoom: Number(image.style.zoom) };
      }),
      baseline.evaluate((element) => Number((element as HTMLElement).style.zoom)),
      preview.locator("html").evaluate(() => window.innerWidth),
    ]);
    expect(centered[0].zoom).toBeLessThan(1);
    expect(centered[0].zoom).toBeCloseTo(centered[1], 6);
    expect(centered[0].width).toBeLessThanOrEqual(centered[2] + 1);
    expect(writes).toEqual([]);
  });

  test("creates a baseline for the exact Storybook interaction selected by the user", async ({
    page,
  }) => {
    const interactionBodies: unknown[] = [];
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.endsWith("/create-interaction-baseline")
      ) {
        interactionBodies.push(request.postDataJSON());
      }
    });
    await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    await expect(
      panel.getByRole("switch", { name: "Show all interactions" }),
    ).toBeVisible();
    await expect(panel.getByTitle(/toBeInTheDocument\(\)$/)).toHaveCount(0);
    await panel.getByRole("switch", { name: "Show all interactions" }).click();
    await expect(panel.getByTitle(/toBeInTheDocument\(\)$/)).toBeVisible();

    await page.getByRole("tab", { name: /Interactions 2/ }).click();
    await page
      .getByRole("button", {
        name: "Go to interaction row: findByTestId. Status: passed.",
      })
      .click();
    await page.getByRole("tab", { name: /Visual Delta/ }).click();

    await expect(
      panel.getByRole("button", {
        name: /findByTestId\("panel-shell"\) No baseline yet · interaction-1-findByTestId/,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      panel.getByRole("switch", {
        name: "Hide interactions without baselines",
      }),
    ).toBeVisible();
    await panel
      .getByRole("button", {
        name: 'More findByTestId("panel-shell") baseline actions',
      })
      .click();
    await page
      .getByRole("dialog", {
        name: 'More findByTestId("panel-shell") baseline actions',
      })
      .getByRole("button", {
        name: /Create .*findByTestId\("panel-shell"\) baseline \(interaction-1-findByTestId\)/,
      })
      .click();

    await expect.poll(() => interactionBodies.length).toBe(1);
    expect(interactionBodies[0]).toEqual({
      storyId: MANAGER_FIXTURE,
      browser: "chromium",
      stepLabel: 'findByTestId("panel-shell")',
      stepId: "interaction-1-findByTestId",
      captureCallId: `${MANAGER_FIXTURE} [1] findByTestId`,
      overwrite: false,
    });
  });

  test("scrolls long interaction listings inside the Visual Delta panel", async ({
    page,
  }) => {
    await mockVisualBackend(page);
    await openManager(page, FILTER_MISSING_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    const showAll = panel.getByRole("switch", {
      name: "Show all interactions",
    });
    await expect(showAll).toBeVisible({ timeout: 10_000 });
    // This real story streams retained instrumenter rows while mounting; force
    // only the presentation-filter setup so the assertion can exercise wheel
    // behavior on the resulting stable list.
    await showAll.click({ force: true });

    const list = panel.getByRole("region", {
      name: "Visual baselines and interactions",
    });
    await expect(list).toBeVisible();
    const metrics = await list.evaluate((element) => {
      const panelShell = element.closest(
        '[data-testid="visual-delta-panel"]',
      );
      const body = element.querySelector(
        "[data-visual-delta-accordion-body]",
      );
      const tail = element.querySelector("[data-visual-delta-scroll-tail]");
      return {
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        panelHeight: panelShell?.getBoundingClientRect().height ?? 0,
        bodyHeight: body?.getBoundingClientRect().height ?? 0,
        tailHeight: tail?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.overflowY).toBe("auto");
    expect(metrics.bodyHeight).toBeGreaterThanOrEqual(400);
    expect(metrics.tailHeight).toBeGreaterThanOrEqual(
      metrics.panelHeight * 0.5 - 1,
    );

    await list.hover();
    await page.mouse.wheel(0, 420);
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
  });

  test("replays an ordinary interaction call to the requested capture point", async ({
    page,
  }) => {
    const interactionId = "interaction-1-findByTestId";
    const params = new URLSearchParams({
      id: MANAGER_FIXTURE,
      viewMode: "story",
      instrument: "true",
      visualCaptureUntil: interactionId,
      visualCaptureCall: `${MANAGER_FIXTURE} [1] findByTestId`,
    });

    await page.goto(`${DEV_STORYBOOK}/iframe.html?${params.toString()}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-visual-capture-ready",
      interactionId,
    );
    await expect(page.getByTestId("panel-shell")).toBeVisible();
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
          ).catch(() => initialLoadCount),
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

    await clickThrough(
      page.getByRole("button", {
        name: "Visual mode: Default, not run",
      }),
    );
    await clickThrough(
      page.getByRole("button", { name: "Dark desktop mode, not run" }),
    );
    await expect(previewFrame(page).locator("html")).toHaveClass(/dark/);
    expect(writes).toEqual([]);
  });

  test("selects mode baselines only through thumbnail-backed mode choices", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, EXAMPLE_MODES_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    await expect(panel.getByTitle(/Select image \d+/)).toHaveCount(0);
    await expect(panel.getByText("Mode", { exact: true })).toHaveCount(0);

    const trigger = panel.getByRole("button", {
      name: "Visual mode: Default, not run",
    });
    await expect(trigger.locator("img")).toHaveAttribute(
      "src",
      /\/visual-baselines\/examples\/modes\/default\.png/,
    );
    await trigger.click();

    const defaultChoice = page.getByRole("button", {
      name: "Default mode, not run",
    });
    const compactChoice = page.getByRole("button", {
      name: "Compact mode, not run",
    });
    await expect(defaultChoice.locator("img")).toHaveAttribute(
      "src",
      /\/visual-baselines\/examples\/modes\/default\.png/,
    );
    await expect(compactChoice.locator("img")).toHaveAttribute(
      "src",
      /\/visual-baselines\/examples\/modes\/compact\.png/,
    );
    await compactChoice.click();

    await expect(
      panel.getByRole("button", {
        name: "Visual mode: Compact, not run",
      }),
    ).toBeVisible();
    await expect(previewFrame(page).getByTestId("examples-modes")).toContainText(
      "Compact mode",
    );
    await expect(
      previewFrame(page).locator("#visual-delta-overlay > img"),
    ).toHaveAttribute(
      "src",
      /\/visual-baselines\/examples\/modes\/compact\.png/,
    );

    await panel
      .getByRole("button", { name: "Visual mode: Compact, not run" })
      .click();
    await page
      .getByRole("button", { name: "Default mode, not run" })
      .click();
    await expect(previewFrame(page).getByTestId("examples-modes")).toContainText(
      "Default mode",
    );
    expect(writes).toEqual([]);
  });

  test("opens VCS history for primary, mode, and interaction baselines", async ({
    page,
  }) => {
    test.skip(true, "Temporarily disabled: flaky mode popover on ARM64 CI");
    await page.route(
      "**/visual-baselines/shadcn/button/*.png*",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: FIXTURE_BASELINE_PNG,
        });
      },
    );
    const writes = await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);
    const panel = page.getByTestId("visual-delta-panel");

    await clickThrough(
      panel.getByRole("button", { name: "More Default baseline actions" }),
    );
    await clickThrough(
      page.getByRole("button", { name: "Open Default baseline history" }),
    );
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

    // Mode selector lives in the expanded Default section (click toggles).
    const modeTrigger = panel.getByRole("button", {
      name: /Visual mode: Default/,
    });
    const defaultSection = panel.getByRole("button", {
      name: /Default\s*End of play · primary baseline/,
    });
    if ((await modeTrigger.count()) === 0) {
      await defaultSection.click();
    }
    if ((await modeTrigger.count()) === 0) {
      await defaultSection.click();
    }
    await expect(modeTrigger).toBeVisible();
    await clickThrough(modeTrigger);
    const darkMode = page.getByRole("button", { name: /Dark desktop mode/ });
    await expect(darkMode).toBeVisible();
    await clickThrough(darkMode);
    await expect(darkMode).toBeHidden();
    await expect(
      panel.getByRole("button", {
        name: "Visual mode: Dark desktop, not run",
      }),
    ).toBeVisible();
    await expect(previewFrame(page).locator("html")).toHaveClass(/dark/);
    const modeActions = panel.getByRole("button", {
      name: "More Default baseline actions",
    });
    await expect(modeActions).toBeVisible();
    await clickThrough(modeActions);
    const modeHistory = page.getByRole("button", {
      name: "Open Default · Dark desktop baseline history",
    });
    await expect(modeHistory).toBeVisible();
    await clickThrough(modeHistory);
    await expect(
      panel.getByRole("heading", { name: "Default · Dark desktop history" }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Back to baseline" }).click();

    await clickThrough(
      panel.getByRole("button", {
        name: "Opened state Baseline wired · opened-state",
        exact: true,
      }),
    );
    await clickThrough(
      panel.getByRole("button", {
        name: "More Opened state baseline actions",
      }),
    );
    await clickThrough(
      page.getByRole("button", {
        name: "Open Opened state baseline history",
      }),
    );
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
    await expect(page.getByTestId("baseline-geometry-warning")).toHaveCount(0);
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
          return (
            image.naturalWidth > 0 &&
            image.naturalHeight > 0 &&
            rect.width > 0 &&
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

  test("persists hidden overlays and split zoom across stories, reloads, and delayed image hydration", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const partialPaintKey = "visual-delta-partial-image-paints";
    await page.addInitScript(
      ({ settingsKey, paintKey }) => {
        if (window === window.top) {
          if (!localStorage.getItem(settingsKey)) {
            localStorage.setItem(
              settingsKey,
              JSON.stringify({
                overlayOn: true,
                splitZoom: null,
                placement: "right",
                opacity: 1,
                colorInversion: false,
                liveVisible: true,
                passThresholdByEngine: { html: 0.063, chromium: 0.063 },
              }),
            );
          }
          return;
        }
        sessionStorage.setItem(paintKey, "[]");
        const inspect = () => {
          const overlay = document.getElementById("visual-delta-overlay");
          const pane = document.getElementById(
            "visual-delta-baseline-pane",
          );
          const visible = (element: HTMLElement | null) =>
            Boolean(
              element &&
                getComputedStyle(element).display !== "none" &&
                getComputedStyle(element).visibility !== "hidden" &&
                element.getBoundingClientRect().width > 0 &&
                element.getBoundingClientRect().height > 0,
            );
          if (
            (visible(overlay) || visible(pane)) &&
            overlay?.dataset.visualDeltaReady !== "true"
          ) {
            const paints = JSON.parse(
              sessionStorage.getItem(paintKey) ?? "[]",
            ) as string[];
            paints.push("unready baseline chrome became visible");
            sessionStorage.setItem(paintKey, JSON.stringify(paints));
          }
        };
        const observe = () => {
          if (!document.body) return;
          new MutationObserver(inspect).observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true,
          });
          inspect();
        };
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", observe, {
            once: true,
          });
        } else {
          observe();
        }
      },
      { settingsKey: SETTINGS_STORAGE_KEY, paintKey: partialPaintKey },
    );
    await page.route(
      "**/visual-baselines/shadcn/tabs/preview-chromium-darwin.png*",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 700));
        await route.continue();
      },
    );
    const writes = await mockVisualBackend(page);
    const readSettings = () =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }, SETTINGS_STORAGE_KEY);
    const ensurePanel = async () => {
      const tab = page.getByRole("tab", { name: "Visual Delta" });
      await expect(tab).toBeVisible();
      if ((await tab.getAttribute("aria-selected")) !== "true") {
        await tab.click();
      }
      await expect(page.getByTestId("visual-delta-panel")).toBeVisible();
    };

    await openManager(page, RESPONSIVE_CANVAS_FIT_FIXTURE, DEV_STORYBOOK);
    const panel = page.getByTestId("visual-delta-panel");
    const frame = previewFrame(page);
    await expect(frame.locator("#visual-delta-overlay > img")).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await frame.locator("html").evaluate((_, key) => {
        return JSON.parse(sessionStorage.getItem(key) ?? "[]");
      }, partialPaintKey),
    ).toEqual([]);

    const baselineRight = panel.getByRole("switch", {
      name: "Baseline right of live",
    });
    if ((await baselineRight.getAttribute("aria-checked")) !== "true") {
      await baselineRight.click();
    }
    await baselineRight.click();
    await expect(frame.locator("#visual-delta-overlay")).toHaveCount(0);
    await expect(frame.locator("#visual-delta-split")).toHaveCount(0);
    await expect.poll(async () => (await readSettings()).overlayOn).toBe(false);

    await openManager(page, CUSTOM_VIEWPORT_MANAGER_FIXTURE, DEV_STORYBOOK);
    await page.waitForTimeout(2_800);
    await expect(
      page.getByRole("button", { name: "Open Default baseline full image" }),
    ).toBeVisible();
    await expect(previewFrame(page).locator("#visual-delta-overlay")).toHaveCount(
      0,
    );
    await expect.poll(async () => (await readSettings()).overlayOn).toBe(false);

    await page.reload({ waitUntil: "domcontentloaded" });
    await ensurePanel();
    await expect(previewFrame(page).locator("#visual-delta-overlay")).toHaveCount(
      0,
    );
    await page.evaluate(() => {
      const iframe = document.querySelector(
        'iframe[title="storybook-preview-iframe"]',
      );
      if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentWindow) {
        throw new Error("Storybook preview iframe is unavailable");
      }
      iframe.contentWindow.location.reload();
    });
    await expect(previewFrame(page).locator("html")).toHaveAttribute(
      "data-visual-delta-story-finished",
      CUSTOM_VIEWPORT_MANAGER_FIXTURE,
      { timeout: 45_000 },
    );
    await expect(previewFrame(page).locator("#visual-delta-overlay")).toHaveCount(
      0,
    );

    const reloadedPanel = page.getByTestId("visual-delta-panel");
    await reloadedPanel
      .getByRole("switch", { name: "Baseline right of live" })
      .click();
    await reloadedPanel
      .getByRole("switch", { name: "Show split comparison at 100%" })
      .click();
    await expect
      .poll(async () => (await readSettings()).splitZoom)
      .toEqual({ mode: "custom", scale: 1 });

    await openManager(page, RESPONSIVE_CANVAS_FIT_FIXTURE, DEV_STORYBOOK);
    const nativeFrame = previewFrame(page);
    const native100 = page.getByRole("switch", {
      name: "Show split comparison at 100%",
    });
    await expect(native100).toHaveAttribute("aria-checked", "true");
    const nativeGeometry = await nativeFrame.locator("body").evaluate((body) => {
      const image = body.querySelector(
        "#visual-delta-baseline-pane #visual-delta-overlay img",
      );
      const pane = body.querySelector("#visual-delta-baseline-pane");
      if (!(image instanceof HTMLImageElement) || !(pane instanceof HTMLElement)) {
        return null;
      }
      const rect = image.getBoundingClientRect();
      return {
        rendered: { width: rect.width, height: rect.height },
        css: {
          width: image.naturalWidth / 3,
          height: image.naturalHeight / 3,
        },
        completeScroll: {
          width: pane.scrollWidth,
          height: pane.scrollHeight,
          clientWidth: pane.clientWidth,
          clientHeight: pane.clientHeight,
        },
      };
    });
    expect(nativeGeometry?.rendered.width).toBeCloseTo(
      nativeGeometry?.css.width ?? 0,
      0,
    );
    expect(nativeGeometry?.rendered.height).toBeCloseTo(
      nativeGeometry?.css.height ?? 0,
      0,
    );
    expect(nativeGeometry?.completeScroll.width).toBeGreaterThan(
      nativeGeometry?.completeScroll.clientWidth ?? Number.POSITIVE_INFINITY,
    );

    await page
      .getByRole("switch", { name: /Fit split comparison/ })
      .click();
    await expect
      .poll(async () => (await readSettings()).splitZoom)
      .toEqual({ mode: "fit", scale: 1 });
    await openManager(page, CUSTOM_VIEWPORT_MANAGER_FIXTURE, DEV_STORYBOOK);
    await openManager(page, RESPONSIVE_CANVAS_FIT_FIXTURE, DEV_STORYBOOK);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ensurePanel();

    const fitFrame = previewFrame(page);
    await expect(
      page.getByRole("switch", { name: /Fit split comparison/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() =>
        fitFrame.locator("body").evaluate((body) => {
          const subject = body.querySelector(
            "[data-testid='responsive-canvas-fit-fixture']",
          );
          const image = body.querySelector(
            "#visual-delta-baseline-pane #visual-delta-overlay img",
          );
          const pane = body.querySelector("#visual-delta-baseline-pane");
          if (
            !(subject instanceof HTMLElement) ||
            !(image instanceof HTMLImageElement) ||
            !(pane instanceof HTMLElement)
          ) {
            return null;
          }
          const subjectRect = subject.getBoundingClientRect();
          const imageRect = image.getBoundingClientRect();
          const paneRect = pane.getBoundingClientRect();
          return {
            viewportWidth: window.innerWidth,
            subjectWidth: subjectRect.width,
            subjectHeight: subjectRect.height,
            imageWidth: imageRect.width,
            imageHeight: imageRect.height,
            contained:
              imageRect.left >= paneRect.left - 1 &&
              imageRect.top >= paneRect.top - 1 &&
              imageRect.right <= paneRect.right + 1 &&
              imageRect.bottom <= paneRect.bottom + 1,
          };
        }),
      )
      .not.toBeNull();
    const finalGeometry = await fitFrame.locator("body").evaluate((body) => {
      const subject = body.querySelector(
        "[data-testid='responsive-canvas-fit-fixture']",
      ) as HTMLElement;
      const image = body.querySelector(
        "#visual-delta-baseline-pane #visual-delta-overlay img",
      ) as HTMLImageElement;
      const pane = body.querySelector(
        "#visual-delta-baseline-pane",
      ) as HTMLElement;
      const subjectRect = subject.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        subjectRect: { width: subjectRect.width, height: subjectRect.height },
        imageRect: { width: imageRect.width, height: imageRect.height },
        contained:
          imageRect.left >= paneRect.left - 1 &&
          imageRect.top >= paneRect.top - 1 &&
          imageRect.right <= paneRect.right + 1 &&
          imageRect.bottom <= paneRect.bottom + 1,
      };
    });
    expect(finalGeometry.viewportWidth).not.toBe(1280);
    expect(finalGeometry.subjectRect.width).toBeCloseTo(
      finalGeometry.imageRect.width,
      0,
    );
    expect(finalGeometry.subjectRect.height).toBeCloseTo(
      finalGeometry.imageRect.height,
      0,
    );
    expect(finalGeometry.contained).toBe(true);
    await expect(page.getByTestId("baseline-geometry-warning")).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("fits a responsive canvas from canonical dimensions in a narrow manager iframe", async ({
    page,
  }) => {
    const compareBodies: Array<Record<string, unknown>> = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/compare-story")) {
        compareBodies.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
    const requests = await mockVisualBackend(page);
    await openManager(page, RESPONSIVE_CANVAS_FIT_FIXTURE, DEV_STORYBOOK);

    const panel = page.getByTestId("visual-delta-panel");
    const frame = previewFrame(page);
    const readFitGeometry = () =>
      frame.locator("body").evaluate((body) => {
        const root = body.querySelector("#storybook-root");
        const subject = body.querySelector(
          "[data-testid='responsive-canvas-fit-fixture']",
        );
        const image = body.querySelector(
          "#visual-delta-baseline-pane #visual-delta-overlay img, #visual-delta-overlay > img",
        );
        if (
          !(root instanceof HTMLElement) ||
          !(subject instanceof HTMLElement) ||
          !(image instanceof HTMLImageElement)
        ) {
          return null;
        }
        const subjectRect = subject.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        return {
          measuredViewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          rootInlineWidth: root.style.width,
          subjectLayout: {
            width: Number.parseFloat(getComputedStyle(subject).width),
            height: Number.parseFloat(getComputedStyle(subject).height),
          },
          baselineCss: {
            width: image.naturalWidth / 3,
            height: image.naturalHeight / 3,
          },
          rendered: {
            subjectWidth: subjectRect.width,
            subjectHeight: subjectRect.height,
            imageWidth: imageRect.width,
            imageHeight: imageRect.height,
          },
        };
      });

    await expect(frame.locator("#visual-delta-overlay > img")).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(readFitGeometry).toMatchObject({
      rootInlineWidth: "1280px",
      subjectLayout: { width: 1232, height: 408 },
      baselineCss: { width: 1232, height: 408 },
    });
    const initial = await readFitGeometry();
    expect(initial?.measuredViewport).not.toEqual({ width: 1280, height: 900 });
    expect(initial?.rendered.subjectWidth).toBeCloseTo(
      initial?.rendered.imageWidth ?? 0,
      0,
    );
    expect(initial?.rendered.subjectHeight).toBeCloseTo(
      initial?.rendered.imageHeight ?? 0,
      0,
    );
    await expect(page.getByTestId("baseline-geometry-warning")).toHaveCount(0);

    await clickThrough(
      panel.getByRole("switch", { name: "Baseline centered over live" }),
    );
    await expect.poll(readFitGeometry).toMatchObject({
      rootInlineWidth: "1280px",
      subjectLayout: { width: 1232, height: 408 },
      baselineCss: { width: 1232, height: 408 },
    });

    await clickThrough(
      panel.getByRole("switch", { name: "Baseline below live" }),
    );
    await expect.poll(readFitGeometry).toMatchObject({
      rootInlineWidth: "1280px",
      subjectLayout: { width: 1232, height: 408 },
    });

    await page.setViewportSize({ width: 1100, height: 800 });
    await expect.poll(readFitGeometry).toMatchObject({
      rootInlineWidth: "1280px",
      subjectLayout: { width: 1232, height: 408 },
      baselineCss: { width: 1232, height: 408 },
    });
    const resized = await readFitGeometry();
    expect(resized?.measuredViewport).not.toEqual({ width: 1280, height: 900 });
    expect(resized?.rendered.subjectWidth).toBeCloseTo(
      resized?.rendered.imageWidth ?? 0,
      0,
    );
    expect(resized?.rendered.subjectHeight).toBeCloseTo(
      resized?.rendered.imageHeight ?? 0,
      0,
    );
    await expect(page.getByTestId("baseline-geometry-warning")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Choose Diff HTML or Diff Browser" })
      .click();
    await page
      .getByRole("button", { name: "Diff Browser", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /Compare via the selected Playwright browser/,
      })
      .click();
    await expect.poll(() => compareBodies.length).toBe(1);
    await expect(
      page.getByRole("button", { name: /Log: Visual: 1 passed \(story\)/i }),
    ).toBeVisible();
    expect(compareBodies[0]).toMatchObject({
      storyId: RESPONSIVE_CANVAS_FIT_FIXTURE,
      browser: "chromium",
    });
    expect(
      requests.filter((pathname) => !pathname.endsWith("/compare-story")),
    ).toEqual([]);
  });
});

test.describe("Visual Delta mobile review layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens the native addon drawer and restores its closed state", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await page.goto(
      `${DEV_STORYBOOK}/?path=/story/${MANAGER_FIXTURE}&panel=visual-delta%2Fpanel`,
      { waitUntil: "networkidle" },
    );

    const openAddonPanel = page.getByRole("button", {
      name: "Open addon panel",
    });
    await expect(openAddonPanel).toBeVisible();
    await page.getByRole("switch", { name: "Review layout" }).click();

    const drawer = page.locator("#storybook-mobile-addon-panel");
    await expect(drawer).toBeVisible();
    const panel = drawer.getByTestId("visual-delta-panel");
    const exit = panel.getByRole("switch", { name: "Exit review layout" });
    await expect(exit).toBeVisible();
    await exit.click();

    await expect(drawer).toBeHidden();
    await expect(openAddonPanel).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Review layout" }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("keeps the native addon drawer open when review began inside it", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await page.goto(
      `${DEV_STORYBOOK}/?path=/story/${MANAGER_FIXTURE}&panel=visual-delta%2Fpanel`,
      { waitUntil: "networkidle" },
    );

    await page.getByRole("button", { name: "Open addon panel" }).click();
    const drawer = page.locator("#storybook-mobile-addon-panel");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("tab", { name: /Visual Delta/ }).click();
    const panel = drawer.getByTestId("visual-delta-panel");

    await panel.getByRole("switch", { name: "Review layout" }).click();
    const exit = panel.getByRole("switch", { name: "Exit review layout" });
    await expect(exit).toBeVisible();
    await exit.click();

    await expect(drawer).toBeVisible();
    await expect(
      panel.getByRole("switch", { name: "Review layout" }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
});
