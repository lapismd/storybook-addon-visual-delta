import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  requiredVisualBaselineBrowsers,
  resolveVisualStoryFacts,
} from "./story-facts.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

describe("resolveVisualStoryFacts", () => {
  it("reports present and missing primary baselines", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    mkdirSync(path.join(snapshotDir, "forms"), { recursive: true });
    writeFileSync(
      path.join(snapshotDir, "forms/default-chromium.png"),
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
        browserCoverage: [
          {
            target: { browser: "chromium" },
            browser: "chromium",
            baseline: "present",
          },
        ],
        baselineHash:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      {
        storyId: "forms-entry--missing",
        baseline: "missing",
        browserCoverage: [
          {
            target: { browser: "chromium" },
            browser: "chromium",
            baseline: "missing",
          },
        ],
      },
    ]);
  });

  it("supports story-id paths without import metadata", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    writeFileSync(
      path.join(snapshotDir, "forms-entry--default-chromium.png"),
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
        browserCoverage: [
          {
            target: { browser: "chromium" },
            browser: "chromium",
            baseline: "present",
          },
        ],
        baselineHash:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    ]);
  });

  it("reports only result evidence matching the current baseline revision", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    const png = path.join(
      snapshotDir,
      "forms-entry--default-chromium.png",
    );
    writeFileSync(png, "current");
    const resultPath = visualArtifactPaths({
      root: snapshotDir,
      snapshotDir,
      baselinePath: png,
    }).result;
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(
      resultPath,
      JSON.stringify({
        version: 4,
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
        ["chromium"],
        [],
        snapshotDir,
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
      {
        storyId: "forms-entry--default",
        baseline: "unresolved",
        browserCoverage: [
          {
            target: { browser: "chromium" },
            browser: "chromium",
            baseline: "unresolved",
          },
        ],
      },
      {
        storyId: "../../outside--default",
        baseline: "unresolved",
        browserCoverage: [
          {
            target: { browser: "chromium" },
            browser: "chromium",
            baseline: "unresolved",
          },
        ],
      },
    ]);
  });

  it("builds required coverage from configured browsers only", () => {
    expect(requiredVisualBaselineBrowsers(["chromium", "firefox", "chromium"]))
      .toEqual(["chromium", "firefox"]);
  });

  it("reports exact primary coverage without requiring disabled browsers", () => {
    const snapshotDir = mkdtempSync(path.join(tmpdir(), "visual-delta-facts-"));
    mkdirSync(path.join(snapshotDir, "forms"), { recursive: true });
    for (const name of ["default-chromium.png", "default-firefox.png", "default-webkit.png"]) {
      writeFileSync(path.join(snapshotDir, "forms", name), "");
    }

    const [fact] = resolveVisualStoryFacts(
      [
        {
          id: "forms-entry--default",
          importPath: "./src/shared/forms/Entry.stories.svelte",
        },
      ],
      snapshotDir,
      "nested-import",
      ["chromium", "firefox"],
      ["chromium", "webkit"],
    );

    expect(fact).toMatchObject({ baseline: "present" });
    expect(fact?.browserCoverage).toEqual([
      {
        target: { browser: "chromium" },
        browser: "chromium",
        baseline: "present",
      },
      {
        target: { browser: "firefox" },
        browser: "firefox",
        baseline: "present",
      },
      {
        target: { browser: "webkit" },
        browser: "webkit",
        baseline: "present",
      },
    ]);
  });
});
