import { captureNamespace } from "./capture-configuration.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  type NativeVisualCaptureProfile,
} from "../shared/capture-profile.js";
import {
  planAffectedVisualTests,
  recordAffectedVisualResults,
} from "./affected-visual-tests.js";

let root: string;
let profile: NativeVisualCaptureProfile;
const id = "example--basic";
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "vd-native-affected-"));
  profile = {
    ...CANONICAL_VISUAL_CAPTURE_PROFILE,
    schemaVersion: 2,
    kind: "native",
    id: "native-fixture",
    os: process.platform as "darwin" | "linux",
    architecture: process.arch as "arm64" | "x64",
    osVersion: "fixture-os",
    image: null,
    imageDigest: null,
    arm64ImageDigest: null,
    fontManifestSha256: `sha256:${"a".repeat(64)}`,
  };
  vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "native");
  vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE_METADATA", JSON.stringify(profile));
  const put = (file: string, value: unknown) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  put("package.json", { name: "native-affected-fixture" });
  put("src/Example.stories.ts", "export const Basic = {};\n");
  put("storybook-static/iframe.html", "<!doctype html><html></html>");
  put("storybook-static/index.json", {
    entries: {
      [id]: {
        id,
        type: "story",
        title: "Example",
        name: "Basic",
        importPath: "./src/Example.stories.ts",
        tags: [],
      },
    },
  });
  put(`.visual-delta/cache/${captureNamespace(root)}/preview-stats.json`, {
    modules: [
      { name: "@storybook/builder-vite", reasons: [] },
      { name: "./src/Example.stories.ts", reasons: [] },
    ],
  });
  expect(recordAffectedVisualResults({ root, passedStoryIds: [id] })).toBe(
    true,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("skips an unchanged passing native story", () => {
  expect(planAffectedVisualTests(root).summary).toMatchObject({
    noChange: true,
    unchanged: 1,
  });
});

it.each(["font", "browser", "os"])(
  "invalidates native passing exclusions after a %s change",
  (change) => {
    if (change === "font")
      profile.fontManifestSha256 = `sha256:${"b".repeat(64)}`;
    if (change === "browser")
      profile.browserVersions = {
        ...profile.browserVersions,
        chromium: "changed-browser",
      };
    if (change === "os") profile.osVersion = "changed-os";
    vi.stubEnv(
      "VISUAL_DELTA_CAPTURE_PROFILE_METADATA",
      JSON.stringify(profile),
    );
    expect(planAffectedVisualTests(root).selectedStoryIds).toEqual([id]);
  },
);

it("recaptures when native font evidence becomes incomplete", () => {
  profile.fontManifestSha256 = null;
  vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE_METADATA", JSON.stringify(profile));
  expect(planAffectedVisualTests(root).selectedStoryIds).toEqual([id]);
});
