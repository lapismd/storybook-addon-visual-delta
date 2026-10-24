import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readCaptureConfiguration,
  captureNamespace,
  pinCaptureConfiguration,
} from "./capture-configuration.js";
import {
  readVisualDeltaProjectConfig,
  writeVisualDeltaProjectConfig,
} from "./project-config.js";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import { resolveSnapshotDir } from "./options.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

const roots: string[] = [];
function fixture(project: unknown = {}, local?: unknown) {
  const root = mkdtempSync(path.join(tmpdir(), "vd-profile-"));
  roots.push(root);
  mkdirSync(path.join(root, ".visual-delta"));
  writeFileSync(
    path.join(root, ".visual-delta/config.json"),
    JSON.stringify(project),
  );
  if (local)
    writeFileSync(
      path.join(root, ".visual-delta/config.local.json"),
      JSON.stringify(local),
    );
  return root;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe("capture profile configuration", () => {
  it("preserves Docker paths and opts into an isolated native namespace", () => {
    const root = fixture();
    expect(readCaptureConfiguration(root).profile).toBe("docker");
    expect(captureNamespace(root)).toBe("");
    const original = resolveSnapshotDir(undefined, root);
    vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "native");
    const namespace = `profiles/native/${process.platform}-${process.arch}`;
    expect(resolveSnapshotDir(undefined, root)).toBe(
      path.join(original, namespace),
    );
    const paths = visualArtifactPaths({
      root,
      snapshotDir: resolveSnapshotDir(undefined, root),
      baselinePath: path.join(
        original,
        namespace,
        "button--basic-chromium.png",
      ),
    });
    expect(paths.actualRelative).toBe(
      `${namespace}/button--basic-chromium.actual.png`,
    );
  });
  it("overlays local defaults without persisting them on project saves", () => {
    vi.stubEnv("CI", "");
    const root = fixture(
      { passThresholdPercent: 0.5, capture: { profile: "docker" } },
      {
        passThresholdPercent: 2,
        browsers: ["firefox"],
        capture: { profile: "native" },
      },
    );
    expect(readCaptureConfiguration(root).profile).toBe("native");
    expect(
      readVisualDeltaProjectConfig(root).defaults.passThresholdPercent,
    ).toBe(2);
    expect(
      readVisualDeltaProjectConfig(root).sources.passThresholdPercent,
    ).toBe("local");
    writeVisualDeltaProjectConfig(root, {
      ...BUILTIN_VISUAL_DELTA_DEFAULTS,
      passThresholdPercent: 0.7,
    });
    const saved = JSON.parse(
      readFileSync(path.join(root, ".visual-delta/config.json"), "utf8"),
    );
    expect(saved.passThresholdPercent).toBe(0.7);
    expect(saved.capture.profile).toBe("docker");
    expect(saved.browsers).toEqual(["chromium"]);
    expect(
      readVisualDeltaProjectConfig(root).defaults.passThresholdPercent,
    ).toBe(2);
  });
  it("disables machine-local settings in CI and on explicit request", () => {
    const root = fixture(
      {},
      { capture: { profile: "native" }, passThresholdPercent: 2 },
    );
    vi.stubEnv("CI", "1");
    expect(readCaptureConfiguration(root).profile).toBe("docker");
    expect(
      readVisualDeltaProjectConfig(root).defaults.passThresholdPercent,
    ).toBe(0.063);
    vi.stubEnv("CI", "");
    vi.stubEnv("VISUAL_DELTA_NO_LOCAL_CONFIG", "1");
    expect(readCaptureConfiguration(root).profile).toBe("docker");
  });
  it("validates explicit profiles, paths and local mutation policy", () => {
    const root = fixture({}, { workflow: { vcs: { mode: "auto" } } });
    vi.stubEnv("CI", "");
    expect(() => readCaptureConfiguration(root)).toThrow(/workflow/);
    vi.stubEnv("VISUAL_DELTA_NO_LOCAL_CONFIG", "1");
    vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "missing");
    expect(() => readCaptureConfiguration(root)).toThrow(
      /Unknown capture profile/,
    );
    vi.stubEnv("VISUAL_DELTA_CAPTURE_PROFILE", "../native");
    expect(() => readCaptureConfiguration(root)).toThrow(/profile/);
  });
  it("keeps explicit paths above profile directory defaults", () => {
    const root = fixture({
      capture: {
        profile: "local",
        profiles: { local: { adapter: "native", snapshotDir: "my-pngs" } },
      },
    });
    expect(resolveSnapshotDir(undefined, root)).toBe(
      path.join(root, "my-pngs", captureNamespace(root)),
    );
    expect(resolveSnapshotDir({ snapshotDir: "explicit" }, root)).toBe(
      path.join(root, "explicit", captureNamespace(root)),
    );
  });
});

it("layers named profile defaults beneath local and story-owned settings", () => {
  vi.stubEnv("CI", "");
  const root = fixture(
    {
      passThresholdPercent: 0.1,
      capture: {
        profile: "workstation",
        profiles: {
          workstation: {
            adapter: "native",
            defaults: { passThresholdPercent: 1 },
            browsers: ["firefox"],
          },
        },
      },
    },
    {
      capture: { profiles: { workstation: { defaults: { delay: 10 } } } },
      passThresholdPercent: 2,
    },
  );
  const config = readVisualDeltaProjectConfig(root);
  expect(config.diagnostics).toEqual([]);
  expect(config.defaults.passThresholdPercent).toBe(2);
  expect(config.defaults.delay).toBe(10);
  expect(config.sources.delay).toBe("profile");
  expect(config.browsers).toEqual(["firefox"]);
  writeVisualDeltaProjectConfig(root, {
    ...config.defaults,
    browsers: config.browsers,
  });
  const saved = JSON.parse(
    readFileSync(path.join(root, ".visual-delta/config.json"), "utf8"),
  );
  expect(saved.passThresholdPercent).toBe(0.1);
  expect(saved.delay).toBe(0);
  expect(saved.browsers).toEqual(["chromium"]);
});

it("keeps a Storybook profile stable until the process restarts", () => {
  const root = fixture({ capture: { profile: "docker" } });
  pinCaptureConfiguration(root);
  writeFileSync(
    path.join(root, ".visual-delta/config.json"),
    JSON.stringify({ capture: { profile: "native" } }),
  );
  expect(readCaptureConfiguration(root).profile).toBe("docker");
  expect(captureNamespace(root)).toBe("");
});
