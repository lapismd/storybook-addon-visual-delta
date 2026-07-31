import { describe, expect, it } from "vitest";
import {
  baselineUrlForStoryRef,
  snapshotDirFromImportPath,
  storySlugFromId,
} from "./baseline-url.js";

describe("snapshotDirFromImportPath", () => {
  it("maps shared and workspace import paths to snapshot dirs", () => {
    expect(
      snapshotDirFromImportPath(
        "./src/shared/shadcn/button/Button.stories.svelte",
      ),
    ).toBe("shadcn/button");
    expect(
      snapshotDirFromImportPath(
        "./packages/workspace/src/lib/tabs/WorkspaceTabs.stories.svelte",
      ),
    ).toBe("workspace/tabs");
  });
});

describe("storySlugFromId", () => {
  it("takes the story name after the first --", () => {
    expect(storySlugFromId("shadcn-actions-button--default")).toBe("default");
    expect(storySlugFromId("forms-x--with--dashes")).toBe("with--dashes");
  });

  it("throws when the id has no story separator", () => {
    expect(() => storySlugFromId("no-separator")).toThrow(
      /Unexpected story id/,
    );
  });
});

describe("baselineUrlForStoryRef", () => {
  it("builds a wired baseline URL", () => {
    expect(
      baselineUrlForStoryRef({
        id: "shadcn-actions-button--default",
        importPath: "./src/shared/shadcn/button/Button.stories.svelte",
        tags: [],
      }),
    ).toBe("/visual-baselines/shadcn/button/default-chromium-darwin.png");
  });

  it("builds nested-import URLs for filter stories", () => {
    expect(
      baselineUrlForStoryRef({
        id: "filter-power-search--add-filter-via-combobox",
        importPath:
          "./src/shared/filter/power-search/PowerSearch.stories.svelte",
      }),
    ).toBe(
      "/visual-baselines/filter/power-search/add-filter-via-combobox-chromium-darwin.png",
    );
  });

  it("nests AI chat baselines under each component folder", () => {
    expect(
      baselineUrlForStoryRef({
        id: "ai-chat-composer--states",
        importPath: "./src/shared/ai/composer/Composer.stories.svelte",
      }),
    ).toBe("/visual-baselines/ai/composer/states-chromium-darwin.png");
  });

  it("skips skip-visual unless allowSkipVisual", () => {
    const story = {
      id: "shadcn-actions-button--default",
      importPath: "./src/shared/shadcn/button/Button.stories.svelte",
      tags: ["skip-visual"],
    };
    expect(baselineUrlForStoryRef(story)).toBeUndefined();
    expect(baselineUrlForStoryRef(story, { allowSkipVisual: true })).toContain(
      "default-chromium-darwin.png",
    );
  });

  it("rejects import paths that escape the snapshot root", () => {
    expect(
      baselineUrlForStoryRef({
        id: "misc--default",
        importPath: "../../outside/Thing.stories.svelte",
      }),
    ).toBeUndefined();
  });
});
