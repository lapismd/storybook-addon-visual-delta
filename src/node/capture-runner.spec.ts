import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCaptureJobManifest,
  resolveVisualDeltaCaptureRunner,
  runVisualDeltaInCaptureRunner,
} from "./capture-runner.js";

describe("capture runner", () => {
  it("freezes and de-duplicates the requested scope", () => {
    const manifest = createCaptureJobManifest({
      root: ".",
      argv: ["test", "--all"],
      operation: "test",
      storyIds: ["a--one", "a--one"],
      browsers: ["chromium", "chromium"],
    });
    expect(manifest.storyIds).toEqual(["a--one"]);
    expect(manifest.browsers).toEqual(["chromium"]);
    expect(manifest.root).toBe(path.resolve("."));
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.storyIds)).toBe(true);
  });

  it("loads a project-owned custom module", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const configDir = path.join(root, ".visual-delta");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `export default { id: "fixture", kind: "custom", profile: { schemaVersion: 1, id: "fixture", os: "linux", architecture: "arm64", image: "fixture", imageDigest: "sha256:${"a".repeat(64)}", arm64ImageDigest: "sha256:${"c".repeat(64)}", nodeVersion: "24", npmVersion: "12", pnpmVersion: "10", playwrightVersion: "1", browsers: ["chromium"], browserVersions: { chromium: "fixture" }, locale: "en-GB", timezoneId: "Europe/London", colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, rendering: { animations: "disabled", caret: "hide", screenshotScale: "device" }, fontManifestSha256: "sha256:${"b".repeat(64)}" }, async run() { return { exitCode: 0, profile: this.profile }; } };\n`,
    );
    try {
      await expect(resolveVisualDeltaCaptureRunner(root)).resolves.toMatchObject({
        id: "fixture",
        kind: "custom",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies checksum-verified custom mutation artifacts only after approval", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const configDir = path.join(root, ".visual-delta");
    const stage = path.join(root, "stage");
    const { mkdirSync, readFileSync } = await import("node:fs");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(stage, { recursive: true });
    const contents = "staged output\n";
    const hash = createHash("sha256").update(contents).digest("hex");
    writeFileSync(path.join(stage, "generated.txt"), contents);
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `const profile = { schemaVersion: 1, id: "fixture", os: "linux", architecture: "arm64", image: "fixture", imageDigest: "sha256:${"a".repeat(64)}", arm64ImageDigest: "sha256:${"c".repeat(64)}", nodeVersion: "24", npmVersion: "12", pnpmVersion: "10", playwrightVersion: "1", browsers: ["chromium"], browserVersions: { chromium: "fixture" }, locale: "en-GB", timezoneId: "Europe/London", colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, rendering: { animations: "disabled", caret: "hide", screenshotScale: "device" }, fontManifestSha256: "sha256:${"b".repeat(64)}" }; export default { id: "fixture", kind: "custom", profile, async run() { return { exitCode: 0, profile, stagedArtifactRoot: ${JSON.stringify(stage)}, stagedArtifacts: [{ relativePath: "generated.txt", sha256: ${JSON.stringify(hash)} }] }; } };\n`,
    );
    try {
      await expect(
        runVisualDeltaInCaptureRunner({
          root,
          argv: ["update", "--approved"],
          operation: "update",
          mutationApproved: true,
        }),
      ).resolves.toBe(0);
      expect(readFileSync(path.join(root, "generated.txt"), "utf8")).toBe(contents);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects terminal metadata that differs from the resolved profile", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const configDir = path.join(root, ".visual-delta");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `const profile = { schemaVersion: 1, id: "declared", os: "linux", architecture: "arm64", image: "fixture", imageDigest: "sha256:${"a".repeat(64)}", arm64ImageDigest: "sha256:${"c".repeat(64)}", nodeVersion: "24", npmVersion: "12", pnpmVersion: "10", playwrightVersion: "1", browsers: ["chromium"], browserVersions: { chromium: "fixture" }, locale: "en-GB", timezoneId: "Europe/London", colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, rendering: { animations: "disabled", caret: "hide", screenshotScale: "device" }, fontManifestSha256: "sha256:${"b".repeat(64)}" }; export default { id: "fixture", kind: "custom", profile, async run() { return { exitCode: 0, profile: { ...profile, id: "different" } }; } };\n`,
    );
    try {
      await expect(
        runVisualDeltaInCaptureRunner({
          root,
          argv: ["test", "--all"],
          operation: "test",
        }),
      ).rejects.toThrow(/does not match/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
