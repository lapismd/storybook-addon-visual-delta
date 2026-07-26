import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseListReporterProgress,
  successfulStoryIdsFromPlaywrightResults,
} from "./playwright-results.js";

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "visual-results-"));
  mkdirSync(path.join(root, "storybook-static"), { recursive: true });
  mkdirSync(path.join(root, "snapshots"), { recursive: true });
  writeFileSync(
    path.join(root, "storybook-static/index.json"),
    JSON.stringify({
      entries: {
        "button--passed": {
          id: "button--passed",
          type: "story",
          title: "Button",
          name: "Passed",
          importPath: "./Button.stories.ts",
        },
        "button--expected-failure": {
          id: "button--expected-failure",
          type: "story",
          title: "Button",
          name: "Expected failure",
          importPath: "./Button.stories.ts",
          tags: ["visual-failed"],
        },
        "button--unexpected-pass": {
          id: "button--unexpected-pass",
          type: "story",
          title: "Button",
          name: "Unexpected pass",
          importPath: "./Button.stories.ts",
          tags: ["visual-failed"],
        },
        "button--failed": {
          id: "button--failed",
          type: "story",
          title: "Button",
          name: "Failed",
          importPath: "./Button.stories.ts",
        },
      },
    }),
  );
  for (const [storyId, status] of [
    ["button--expected-failure", "failed"],
    ["button--unexpected-pass", "passed"],
    ["button--failed", "failed"],
  ] as const) {
    writeFileSync(
      path.join(root, "snapshots", `${storyId}-chromium-darwin.json`),
      JSON.stringify({
        version: 1,
        storyId,
        snapshotRel: `${storyId}.png`,
        status,
        generatedAt: new Date(0).toISOString(),
        tool: "playwright",
      }),
    );
  }
  return root;
}

describe("Playwright result normalization", () => {
  it("parses passing and failed list-reporter lines", () => {
    expect(
      parseListReporterProgress(
        [
          "  ✓   1 [chromium] › visual.spec.ts › Button › button--passed (1.2s)",
          "  ✘   2 [chromium] › visual.spec.ts › Button › button--failed (800ms)",
        ].join("\n"),
      ),
    ).toEqual([
      { index: 1, storyId: "button--passed", status: "passed" },
      { index: 2, storyId: "button--failed", status: "failed" },
    ]);
  });

  it("keeps genuine and unexpected-pass failures affected", () => {
    const root = fixtureRoot();
    const results = [
      { storyId: "button--passed", status: "passed" as const },
      { storyId: "button--expected-failure", status: "failed" as const },
      { storyId: "button--unexpected-pass", status: "failed" as const },
      { storyId: "button--failed", status: "failed" as const },
    ];

    expect(
      successfulStoryIdsFromPlaywrightResults({
        root,
        hostOptions: {
          snapshotDir: "snapshots",
          baselinePathMode: "story-id",
        },
        results,
      }).sort(),
    ).toEqual(["button--expected-failure", "button--passed"]);
  });
});
