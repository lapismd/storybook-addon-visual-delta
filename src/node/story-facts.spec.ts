import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVisualStoryFacts } from "./story-facts.js";

describe("resolveVisualStoryFacts", () => {
  it("reports present and missing primary baselines", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    mkdirSync(path.join(snapshotDir, "forms"), { recursive: true });
    writeFileSync(
      path.join(snapshotDir, "forms/default-chromium-darwin.png"),
      "",
    );

    expect(
      resolveVisualStoryFacts(
        [
          {
            id: "forms-entry--default",
            importPath: "./src/shared/forms/Entry.stories.svelte",
          },
          {
            id: "forms-entry--missing",
            importPath: "./src/shared/forms/Entry.stories.svelte",
          },
        ],
        snapshotDir,
        "nested-import",
      ),
    ).toEqual([
      {
        storyId: "forms-entry--default",
        baseline: "present",
        baselineHash:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      { storyId: "forms-entry--missing", baseline: "missing" },
    ]);
  });

  it("supports story-id paths without import metadata", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    writeFileSync(
      path.join(snapshotDir, "forms-entry--default-chromium-darwin.png"),
      "",
    );
    expect(
      resolveVisualStoryFacts(
        [{ id: "forms-entry--default" }],
        snapshotDir,
        "story-id",
      ),
    ).toEqual([
      {
        storyId: "forms-entry--default",
        baseline: "present",
        baselineHash:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    ]);
  });

  it("reports only result evidence matching the current baseline revision", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    const png = path.join(
      snapshotDir,
      "forms-entry--default-chromium-darwin.png",
    );
    writeFileSync(png, "current");
    writeFileSync(
      png.replace(/\.png$/, ".json"),
      JSON.stringify({
        version: 2,
        storyId: "forms-entry--default",
        snapshotRel: "forms-entry--default.png",
        status: "passed",
        generatedAt: new Date(0).toISOString(),
        tool: "playwright",
        baselineHash:
          "97b0560280ed60a5a1eaa1bc45492543c8a986ad5a25b468c427eb83c3e88191",
        captureConfigHash: "config-hash",
      }),
    );

    expect(
      resolveVisualStoryFacts(
        [{ id: "forms-entry--default" }],
        snapshotDir,
        "story-id",
      )[0],
    ).toMatchObject({
      resultBaselineHash:
        "97b0560280ed60a5a1eaa1bc45492543c8a986ad5a25b468c427eb83c3e88191",
      resultCaptureConfigHash: "config-hash",
    });
  });

  it("marks missing metadata and escaping paths unresolved", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    expect(
      resolveVisualStoryFacts(
        [{ id: "forms-entry--default" }, { id: "../../outside--default" }],
        snapshotDir,
        "nested-import",
      ),
    ).toEqual([
      { storyId: "forms-entry--default", baseline: "unresolved" },
      { storyId: "../../outside--default", baseline: "unresolved" },
    ]);
  });
});
