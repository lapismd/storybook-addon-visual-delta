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
});
