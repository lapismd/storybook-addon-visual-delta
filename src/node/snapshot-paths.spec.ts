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

  it("preserves the filename shape for Firefox and WebKit", () => {
    expect(snapshotFileName(entry, "nested-import", "firefox", "linux")).toBe(
      "shadcn/button/primary-firefox-linux.png",
    );
    expect(snapshotFileName(entry, "nested-import", "webkit", "win32")).toBe(
      "shadcn/button/primary-webkit-win32.png",
    );
  });

  it("nests AI chat baselines under each component folder", () => {
    expect(
      screenshotRelativePath(
        {
          id: "ai-chat-composer--astryx-showcase",
          importPath: "./src/shared/ai/composer/Composer.stories.svelte",
        },
        "nested-import",
      ),
    ).toBe("ai/composer/astryx-showcase.png");
    expect(
      screenshotRelativePath(
        {
          id: "ai-chat-layout--astryx-showcase",
          importPath: "./src/shared/ai/layout/Layout.stories.svelte",
        },
        "nested-import",
      ),
    ).toBe("ai/layout/astryx-showcase.png");
  });
});
