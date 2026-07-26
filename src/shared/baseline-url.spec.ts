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

  it("ignores unwired directories", () => {
    expect(
      baselineUrlForStoryRef({
        id: "misc--default",
        importPath: "./src/other/Thing.stories.svelte",
      }),
    ).toBeUndefined();
  });
});
