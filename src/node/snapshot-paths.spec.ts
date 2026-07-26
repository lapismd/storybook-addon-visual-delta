import { describe, expect, it } from "vitest";
import {
  screenshotRelativePath,
  snapshotFileName,
  type StoryIndexEntry,
} from "./snapshot-paths.js";

const entry: StoryIndexEntry = {
  id: "shadcn-button--primary",
  importPath: "./src/shared/shadcn/button/Button.stories.svelte",
};

describe("mode snapshot paths", () => {
  it("inserts the mode slug before the Playwright project suffix", () => {
    expect(screenshotRelativePath(entry, "nested-import", "Dark Desktop")).toBe(
      "shadcn/button/primary--dark-desktop.png",
    );
    expect(
      snapshotFileName(
        entry,
        "nested-import",
        "chromium",
        "darwin",
        "Dark Desktop",
      ),
    ).toBe("shadcn/button/primary--dark-desktop-chromium-darwin.png");
  });

  it("includes the story filename when components share a story directory", () => {
    expect(
      screenshotRelativePath(
        {
          id: "ai-chat-composer--astryx-showcase",
          importPath: "./src/shared/ai/chat/Composer.stories.svelte",
        },
        "nested-import",
      ),
    ).toBe("ai/chat/composer/astryx-showcase.png");
    expect(
      screenshotRelativePath(
        {
          id: "ai-chat-layout--astryx-showcase",
          importPath: "./src/shared/ai/chat/Layout.stories.svelte",
        },
        "nested-import",
      ),
    ).toBe("ai/chat/layout/astryx-showcase.png");
  });
});
