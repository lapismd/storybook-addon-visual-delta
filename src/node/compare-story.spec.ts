import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveCompareStoryBaselinePath,
  validateCompareStoryBaselineTarget,
} from "./compare-story.js";

describe("validateCompareStoryBaselineTarget", () => {
  it("accepts an explicit matching target for an unqualified teaching asset", () => {
    expect(
      validateCompareStoryBaselineTarget({
        baselineUrl: "/visual-baselines/examples/gallery/compact.png",
        browser: "chromium",
        target: { browser: "chromium" },
      }),
    ).toEqual({ browser: "chromium" });
  });

  it("rejects an unqualified asset without explicit target metadata", () => {
    expect(() =>
      validateCompareStoryBaselineTarget({
        baselineUrl: "/visual-baselines/examples/gallery/compact.png",
        browser: "chromium",
      }),
    ).toThrow("Baseline target must match chromium.");
  });

  it("keeps canonical filename identity authoritative", () => {
    expect(
      validateCompareStoryBaselineTarget({
        baselineUrl: "/visual-baselines/gallery-compact-firefox.png",
        browser: "firefox",
        target: { browser: "firefox" },
      }),
    ).toEqual({ browser: "firefox" });
    expect(() =>
      validateCompareStoryBaselineTarget({
        baselineUrl: "/visual-baselines/gallery-compact-firefox.png",
        browser: "chromium",
        target: { browser: "chromium" },
      }),
    ).toThrow("Baseline target must match chromium.");
  });

  it("rejects metadata that conflicts with a canonical filename", () => {
    expect(() =>
      validateCompareStoryBaselineTarget({
        baselineUrl: "/visual-baselines/gallery-compact-chromium.png",
        browser: "chromium",
        target: { browser: "firefox" },
      }),
    ).toThrow("Baseline target must match chromium.");
  });
});

describe("resolveCompareStoryBaselinePath", () => {
  it("resolves an explicitly targeted teaching PNG beneath snapshotDir", () => {
    const root = path.join(path.sep, "workspace", "addon");
    expect(
      resolveCompareStoryBaselinePath({
        root,
        hostOptions: { snapshotDir: "snapshots" },
        storyId: "examples-gallery--compact-variant",
        baselineUrl: "/visual-baselines/examples/gallery/compact.png",
        browser: "chromium",
        target: { browser: "chromium" },
      }),
    ).toEqual({
      absolutePath: path.join(
        root,
        "snapshots/examples/gallery/compact.png",
      ),
      relativePath: "examples/gallery/compact.png",
      snapshotRoot: path.join(root, "snapshots"),
    });
  });

  it("does not admit derived artifacts as teaching baselines", () => {
    expect(() =>
      resolveCompareStoryBaselinePath({
        root: path.join(path.sep, "workspace", "addon"),
        hostOptions: { snapshotDir: "snapshots" },
        storyId: "examples-gallery--compact-variant",
        baselineUrl: "/visual-baselines/examples/gallery/compact.diff.png",
        browser: "chromium",
        target: { browser: "chromium" },
      }),
    ).toThrow("Unsupported baseline target");
  });
});
