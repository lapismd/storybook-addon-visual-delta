import { expect, test, type Page } from "@playwright/test";
import {
  MANAGER_FIXTURE,
  mockVisualBackend,
  openManager,
} from "./manager-test-support.js";

const DEV_STORYBOOK = `http://127.0.0.1:${
  process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ??
  Number(process.env.STORYBOOK_PORT ?? "9009") + 4
}`;
const SIDEBAR_STATUS_FIXTURE = "shadcn-feedback-empty--preview";
const SIDEBAR_LABEL_FIXTURE = "shadcn-feedback-empty--preview";

async function mockFixtureTags(page: Page, tags: string[]) {
  await page.route("**/index.json", async (route) => {
    const response = await route.fetch();
    const index = (await response.json()) as {
      entries?: Record<string, { tags?: string[]; title?: string }>;
    };
    for (const fixture of Object.values(index.entries ?? {})) {
      if (!fixture.title?.startsWith("Shadcn/Feedback/")) continue;
      // Keep Storybook built-ins (dev/test/manifest/…). Replacing the whole
      // tag list drops them and the static/tag filters hide the story.
      const preserved = (fixture.tags ?? []).filter(
        (tag) =>
          !tag.startsWith("visual-") &&
          tag !== "skip-visual" &&
          !tags.includes(tag),
      );
      fixture.tags = [...preserved, ...tags];
    }
    await route.fulfill({ response, json: index });
  });
}

async function openStoryContextMenu(page: Page) {
  const storyItem = page.locator(`[data-item-id="${MANAGER_FIXTURE}"]`);
  await expect(storyItem).toBeVisible();
  await storyItem.hover();
  await page.getByRole("button", { name: "Open context menu" }).click();
  const contextMenu = page.getByTestId("visual-test-module-context");
  await expect(contextMenu).toBeVisible();
  return contextMenu;
}

test.describe("Visual Delta Storybook sidebar menus", () => {
  test("renders the current story's named status in the toolbar", async ({
    page,
  }) => {
    await mockFixtureTags(page, ["visual-ready"]);
    await mockVisualBackend(page);
    await openManager(page, SIDEBAR_LABEL_FIXTURE, DEV_STORYBOOK);

    await expect(
      page
        .getByRole("region", { name: "Toolbar" })
        .locator('[data-tag="visual-ready"]')
        .filter({ hasText: "Ready" }),
    ).toBeVisible();
    // Package self-test stubs use component name "Empty" (UI catalog used the
    // Feedback group label with the same badge aria-label suffix).
    const feedback = page.getByRole("button", {
      name: "Empty Ready: Visual baseline is ready for review",
      exact: true,
    });
    await expect(feedback.locator('[data-tag="visual-ready"]')).toBeVisible();
  });

  test("filters the real sidebar and persists canonical URL state", async ({
    page,
  }) => {
    await mockFixtureTags(page, ["visual-ready"]);
    const writes = await mockVisualBackend(page);
    await openManager(page, SIDEBAR_LABEL_FIXTURE, DEV_STORYBOOK);

    await page.getByRole("button", { name: "Expand testing module" }).click();
    const module = page.getByTestId("visual-test-module-global");
    await module.getByRole("button", { name: "Filter visual stories" }).click();
    await page.getByRole("checkbox", { name: "Ready for review" }).check();

    await expect(page).toHaveURL(/visualFilter=review\.ready/);
    await expect(
      page.getByRole("button", {
        name: "Empty Ready: Visual baseline is ready for review",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Select Skip visual: Excluded from Visual Delta tests",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      module.getByRole("button", {
        name: "Filter visual stories, 1 active",
      }),
    ).toBeVisible();
    await expect(
      page.getByTestId("visual-filter-match-summary"),
    ).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/visualFilter=review\.ready/);
    await page.getByRole("button", { name: "Expand testing module" }).click();
    await expect(
      page.getByTestId("visual-test-module-global").getByRole("button", {
        name: "Filter visual stories, 1 active",
      }),
    ).toBeVisible();

    await page
      .getByTestId("visual-test-module-global")
      .getByRole("button", {
        name: "Filter visual stories, 1 active",
      })
      .click();
    await page
      .getByRole("button", { name: "Exclude Ready for review" })
      .click();
    await expect(page).toHaveURL(/visualFilter=!review\.ready/);
    await expect(
      page.getByText(/Ready for review \(excluded\)/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Empty Ready: Visual baseline is ready for review",
        exact: true,
      }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page).not.toHaveURL(/visualFilter=/);
    expect(writes).toEqual([]);
  });

  test("renders the global module and real story context menu", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);

    const globalModule = page.getByTestId("visual-test-module-global");
    await expect(globalModule).toBeVisible();
    await expect(
      globalModule.getByRole("button", { name: "Run tests" }),
    ).toBeVisible();
    await expect(
      globalModule.getByRole("checkbox", { name: "Run Diff" }),
    ).toBeVisible();
    await expect(
      globalModule.getByRole("checkbox", { name: "Run Diff" }),
    ).not.toBeChecked();

    const contextMenu = await openStoryContextMenu(page);
    await expect(
      contextMenu.getByRole("button", {
        name: "Choose Create missing or Rewrite existing",
      }),
    ).toBeVisible();
    await expect(
      contextMenu.getByRole("checkbox", { name: "Run Diff" }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("changes baseline write mode through the context-menu chooser", async ({
    page,
  }) => {
    const writes = await mockVisualBackend(page);
    await openManager(page, MANAGER_FIXTURE, DEV_STORYBOOK);
    const contextMenu = await openStoryContextMenu(page);

    await contextMenu
      .getByRole("button", {
        name: "Choose Create missing or Rewrite existing",
      })
      .click();
    const rewriteExisting = page.getByText("Rewrite existing", { exact: true });
    await expect(rewriteExisting).toBeVisible();
    await rewriteExisting.click();

    await expect(
      contextMenu.getByRole("checkbox", { name: /update baselines/i }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });

  for (const status of [
    {
      tag: "skip-visual",
      name: "Skip visual: Excluded from Visual Delta tests",
    },
    {
      tag: "visual-failed",
      name: "Failed: Visual baseline failed or was rejected",
    },
    {
      tag: "visual-ready",
      name: "Ready: Visual baseline is ready for review",
    },
    {
      tag: "visual-pending",
      name: "Pending review: Visual baseline is awaiting review",
    },
    {
      tag: "visual-approved",
      name: "Approved: Visual baseline has been reviewed and accepted",
    },
  ]) {
    test(`renders the committed ${status.tag} label without the badge addon`, async ({
      page,
    }) => {
      await mockFixtureTags(page, [status.tag]);
      await mockVisualBackend(page);
      await openManager(page, SIDEBAR_STATUS_FIXTURE, DEV_STORYBOOK);

      const storyItem = page.getByRole("button", {
        name: `Empty ${status.name}`,
        exact: true,
      });
      await expect(
        storyItem.locator(`[data-tag="${status.tag}"]`),
      ).toBeVisible();
    });
  }
});
