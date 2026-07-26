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
      { storyId: "forms-entry--default", baseline: "present" },
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
    ).toEqual([{ storyId: "forms-entry--default", baseline: "present" }]);
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
