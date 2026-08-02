import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareStoryInCaptureRunner,
  resolveCompareStoryBaselinePath,
  validateCompareStoryBaselineTarget,
} from "./compare-story.js";

const runnerProfile = {
  schemaVersion: 1,
  id: "compare-fixture",
  os: "linux",
  architecture: "arm64",
  image: "fixture",
  imageDigest: `sha256:${"a".repeat(64)}`,
  arm64ImageDigest: `sha256:${"c".repeat(64)}`,
  nodeVersion: "24",
  npmVersion: "12",
  pnpmVersion: "10",
  playwrightVersion: "1",
  browsers: ["chromium"],
  browserVersions: { chromium: "fixture" },
  locale: "en-GB",
  timezoneId: "Europe/London",
  colorScheme: "light",
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  rendering: {
    animations: "disabled",
    caret: "hide",
    screenshotScale: "device",
  },
  fontManifestSha256: `sha256:${"b".repeat(64)}`,
} as const;

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

describe("compareStoryInCaptureRunner", () => {
  it("runs the exact packaged CLI test through the configured capture runner", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-compare-"));
    const stage = path.join(root, "stage");
    const configDir = path.join(root, ".visual-delta");
    const baselineRelative = "snapshots/examples-card--default-chromium.png";
    const sidecarRelative = baselineRelative.replace(/\.png$/, ".json");
    mkdirSync(path.join(stage, "snapshots"), { recursive: true });
    mkdirSync(path.join(root, "snapshots"), { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(root, baselineRelative), Buffer.from("baseline"));
    const sidecar = `${JSON.stringify({
      version: 3,
      storyId: "examples-card--default",
      title: "Examples/Card",
      snapshotRel: "examples-card--default.png",
      status: "passed",
      runnerStatus: "passed",
      outcome: "passed",
      policyStatus: "passed",
      passed: true,
      generatedAt: new Date(0).toISOString(),
      tool: "playwright",
      target: { browser: "chromium" },
      browser: "chromium",
      captureProfile: runnerProfile,
    })}\n`;
    writeFileSync(path.join(stage, sidecarRelative), sidecar);
    const sidecarHash = createHash("sha256").update(sidecar).digest("hex");
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `import { writeFileSync } from "node:fs"; const profile = ${JSON.stringify(runnerProfile)}; const stage = ${JSON.stringify(stage)}; export default { id: "compare-fixture", kind: "custom", profile, async run(manifest, context) { context.onEvent?.({ type: "start", profile }); writeFileSync(stage + "/argv.json", JSON.stringify(manifest.argv)); return { exitCode: 0, profile, stagedArtifactRoot: stage, stagedArtifacts: [{ relativePath: ${JSON.stringify(sidecarRelative)}, sha256: ${JSON.stringify(sidecarHash)} }] }; } };\n`,
    );
    try {
      const result = await compareStoryInCaptureRunner({
        root,
        hostOptions: {
          snapshotDir: "snapshots",
          baselinePathMode: "story-id",
        },
        request: {
          origin: "http://localhost:6006",
          storyId: "examples-card--default",
          story: {
            id: "examples-card--default",
            title: "Examples/Card",
            name: "Default",
            importPath: "./src/card.stories.ts",
          },
          baselineUrl:
            "/visual-baselines/examples-card--default-chromium.png",
          browser: "chromium",
        },
      });
      expect(result.captureProfile).toEqual(runnerProfile);
      expect(result.sidecar.outcome).toBe("passed");
      const argv = JSON.parse(readFileSync(path.join(stage, "argv.json"), "utf8")) as string[];
      expect(argv).toEqual(
        expect.arrayContaining([
          "test",
          "--story-id",
          "examples-card--default",
          "--browser",
          "chromium",
        ]),
      );
      expect(argv).not.toContain("--all");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
