import * as childProcess from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  currentVisualCaptureProfile,
  supportsPersistentCaptureReuse,
} from "./capture-profile.js";
import { recompareCachedActualSet } from "./cached-actual.js";
import { writeDiffArtifactsForBaseline } from "../playwright/write-diff-artifacts.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof childProcess>();
  const execFileSync = vi.fn();
  return { ...actual, default: { ...actual, execFileSync }, execFileSync };
});
let root: string;
let font: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "vd-native-reuse-"));
  font = path.join(root, "font.ttf");
  writeFileSync(font, "font-one");
  symlinkSync(
    path.join(process.cwd(), "node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "native");
  vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE_METADATA", "");
  vi.mocked(childProcess.execFileSync).mockImplementation(((
    command: string,
  ) => {
    if (command.includes("system_profiler"))
      return JSON.stringify({
        SPFontsDataType: [{ path: font, enabled: "yes" }],
      });
    if (command === "fc-list") return `${font}\n`;
    if (command === "fc-conflist") return `+ ${font}: fixture configuration\n`;
    throw new Error(`Unexpected font probe ${command}`);
  }) as typeof childProcess.execFileSync);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  rmSync(root, { recursive: true, force: true });
});

it("enables native reuse with measured host-font evidence", () => {
  expect(currentVisualCaptureProfile(root).fontManifestSha256).toMatch(
    /^sha256:[a-f0-9]{64}$/,
  );
  expect(supportsPersistentCaptureReuse(root)).toBe(true);
});

it("reuses native actuals and invalidates them when font bytes change", () => {
  const snapshotDir = path.join(root, "snapshots");
  const baselinePath = path.join(snapshotDir, "example--story-chromium.png");
  const entry = {
    id: "example--story",
    type: "story",
    title: "Example",
    name: "Story",
    importPath: "./Example.stories.ts",
  } as const;
  mkdirSync(snapshotDir);
  mkdirSync(path.join(root, "storybook-static"));
  writeFileSync(
    path.join(root, "storybook-static/index.json"),
    JSON.stringify({ entries: { [entry.id]: entry } }),
  );
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const bytes = PNG.sync.write(png);
  writeFileSync(baselinePath, bytes);
  writeDiffArtifactsForBaseline({
    entry,
    packageRoot: root,
    snapshotDir,
    mode: "story-id",
    baselinePngAbsPath: baselinePath,
    status: "passed",
    actualPng: bytes,
    captureConfig: { align: "viewport" },
    renderFingerprint: "native-render-v1",
  });
  const options = {
    root,
    snapshotDir,
    baselinePath,
    storyId: entry.id,
    browser: "chromium",
    baselinePathMode: "story-id",
    renderFingerprint: "native-render-v1",
    failureMode: "strict",
  } as const;
  expect(recompareCachedActualSet(options)).toMatchObject({
    source: "cached-actual",
    passed: true,
  });
  const artifacts = visualArtifactPaths({ root, snapshotDir, baselinePath });
  expect(readFileSync(artifacts.actual)).toEqual(bytes);
  writeFileSync(font, "font-two");
  expect(recompareCachedActualSet(options)).toBeNull();
  expect(readFileSync(baselinePath)).toEqual(bytes);
});

it("keeps incomplete native font evidence conservative", () => {
  vi.mocked(childProcess.execFileSync).mockImplementation(() => {
    throw new Error("font inventory unavailable");
  });
  expect(currentVisualCaptureProfile(root).fontManifestSha256).toBeNull();
  expect(supportsPersistentCaptureReuse(root)).toBe(false);
});
