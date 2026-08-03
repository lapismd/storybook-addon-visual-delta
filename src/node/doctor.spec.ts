import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import {
  formatVisualDeltaDoctorReport,
  runVisualDeltaDoctor,
  visualDeltaDoctorExitCode,
  type VisualDeltaDoctorDependencies,
} from "./doctor.js";

const PACKAGE_NAME = "@lapismd/storybook-addon-visual-delta";

function write(root: string, relative: string, contents: string | Buffer): string {
  const filePath = path.join(root, ...relative.split("/"));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  return filePath;
}

function hash(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function fixture() {
  const cacheRoot = path.join(process.cwd(), ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const root = mkdtempSync(path.join(cacheRoot, "doctor-fixture-"));
  write(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: PACKAGE_NAME,
        scripts: {
          "test:visual": "visual-delta test --all",
          "test:visual:affected": "visual-delta test --affected",
          "build-storybook":
            "storybook build --stats-json .visual-delta/cache",
        },
      },
      null,
      2,
    )}\n`,
  );
  write(root, ".gitignore", ".visual-delta/artifacts/\n.visual-delta/cache/\n");
  write(root, ".storybook/main.ts", "export default {};\n");
  write(
    root,
    "playwright.config.ts",
    "defineVisualPlaywrightConfig();\n",
  );
  write(root, "tests/visual/storybook.spec.ts", "defineVisualSuite();\n");
  write(
    root,
    "src/Button.stories.ts",
    `export const Primary = { parameters: { visualDelta: { images: ["/visual-baselines/teaching.png", "/visual-baselines/components-button--primary--clicked-chromium.png"] } } };\n`,
  );
  write(root, "storybook-static/iframe.html", "<!doctype html>\n");
  const indexPath = write(
    root,
    "storybook-static/index.json",
    `${JSON.stringify({
      entries: {
        "components-button--primary": {
          id: "components-button--primary",
          type: "story",
          title: "Components/Button",
          name: "Primary",
          importPath: "./src/Button.stories.ts",
          tags: [],
        },
      },
    })}\n`,
  );
  const future = new Date(Date.now() + 2_000);
  utimesSync(indexPath, future, future);
  const snapshotDir = path.join(
    root,
    "tests/visual/storybook.spec.ts-snapshots",
  );
  mkdirSync(snapshotDir, { recursive: true });
  return { root, snapshotDir };
}

function dependencies(
  probe = vi.fn(async () => ({ ok: true, diagnostics: [] as string[] })),
): VisualDeltaDoctorDependencies {
  return {
    loadMainConfig: async () => ({ addons: [PACKAGE_NAME] }),
    resolveRunner: async () => ({
      id: "fixture-runner",
      kind: "custom",
      profile: CANONICAL_VISUAL_CAPTURE_PROFILE,
      doctor: probe,
      run: async () => ({
        exitCode: 0,
        profile: CANONICAL_VISUAL_CAPTURE_PROFILE,
      }),
    }),
  };
}

function snapshotManifest(snapshotDir: string): Record<string, string> {
  const output: Record<string, string> = {};
  const pending = [snapshotDir];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        output[path.relative(snapshotDir, absolute)] = hash(readFileSync(absolute));
      }
    }
  }
  return output;
}

describe("visual-delta doctor", () => {
  it("inventories canonical, legacy, disabled, teaching, and orphan images without writing", async () => {
    const current = fixture();
    try {
      write(
        current.snapshotDir,
        "components-button--primary-chromium.png",
        "baseline",
      );
      write(
        current.snapshotDir,
        "components-button--primary-firefox.png",
        "disabled",
      );
      write(
        current.snapshotDir,
        "components-button--primary--clicked-chromium.png",
        "interaction",
      );
      write(current.snapshotDir, "teaching.png", "teaching");
      write(
        current.snapshotDir,
        "components-button--primary-chromium-darwin.png",
        "legacy",
      );
      write(current.snapshotDir, "removed-story--default-chromium.png", "orphan");
      const before = snapshotManifest(current.snapshotDir);
      const probe = vi.fn(async () => ({ ok: true, diagnostics: [] as string[] }));

      const report = await runVisualDeltaDoctor(
        { root: current.root },
        dependencies(probe),
      );

      expect(report.resolved.indexFresh).toBe(true);
      expect(report.inventory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "canonical-baseline" }),
          expect.objectContaining({ kind: "disabled-browser-baseline" }),
          expect.objectContaining({ kind: "teaching-image" }),
          expect.objectContaining({ kind: "legacy-platform-baseline" }),
          expect.objectContaining({ kind: "orphan-baseline" }),
        ]),
      );
      expect(probe).not.toHaveBeenCalled();
      expect(snapshotManifest(current.snapshotDir)).toEqual(before);
      expect(existsSync(path.join(current.root, ".visual-delta"))).toBe(false);
      expect(visualDeltaDoctorExitCode(report)).toBe(0);
      expect(visualDeltaDoctorExitCode(report, true)).toBe(1);
      expect(formatVisualDeltaDoctorReport(report)).toContain(
        "Visual Delta doctor",
      );
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("runs the slow runner probe only when requested", async () => {
    const current = fixture();
    try {
      const probe = vi.fn(async () => ({ ok: true, diagnostics: [] as string[] }));
      const report = await runVisualDeltaDoctor(
        { root: current.root, runner: true },
        dependencies(probe),
      );
      expect(probe).toHaveBeenCalledOnce();
      expect(report.checks).toContainEqual(
        expect.objectContaining({ code: "runner-probe", severity: "pass" }),
      );
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("supports an external snapshot directory without treating it as derived state", async () => {
    const current = fixture();
    const external = mkdtempSync(
      path.join(process.cwd(), ".cache/doctor-external-snapshots-"),
    );
    try {
      write(external, "components-button--primary-chromium.png", "baseline");

      const report = await runVisualDeltaDoctor(
        { root: current.root, snapshotDir: external },
        dependencies(),
      );

      expect(report.resolved.snapshotDir).toBe(external);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          code: "snapshot-directory",
          severity: "pass",
          message: expect.stringContaining("external to the host root"),
        }),
      );
      expect(report.checks).not.toContainEqual(
        expect.objectContaining({ code: "snapshot-directory-safety" }),
      );
      expect(existsSync(path.join(current.root, ".visual-delta"))).toBe(false);
    } finally {
      rmSync(current.root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("does not traverse a symbolic-link snapshot root", async () => {
    const current = fixture();
    const external = mkdtempSync(
      path.join(process.cwd(), ".cache/doctor-linked-snapshots-"),
    );
    const linked = path.join(current.root, "linked-snapshots");
    try {
      write(external, "removed-story--default-chromium.png", "baseline");
      symlinkSync(external, linked, "dir");

      const report = await runVisualDeltaDoctor(
        { root: current.root, snapshotDir: linked },
        dependencies(),
      );

      expect(report.ok).toBe(false);
      expect(report.summary.files).toBe(0);
      expect(report.inventory).toEqual([]);
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          code: "snapshot-directory",
          severity: "error",
          message: "The configured snapshot directory is a symbolic link.",
        }),
      );
    } finally {
      rmSync(current.root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("rebuilds Storybook only when explicitly requested", async () => {
    const current = fixture();
    try {
      const runBuild = vi.fn();
      const base = dependencies();

      await runVisualDeltaDoctor(
        { root: current.root },
        { ...base, runBuild },
      );
      expect(runBuild).not.toHaveBeenCalled();

      const report = await runVisualDeltaDoctor(
        { root: current.root, build: true, json: true },
        { ...base, runBuild },
      );
      expect(runBuild).toHaveBeenCalledWith(current.root, true);
      expect(report.checks).toContainEqual(
        expect.objectContaining({ code: "storybook-build", severity: "pass" }),
      );
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("suppresses orphan claims when the static index is stale", async () => {
    const current = fixture();
    try {
      write(current.snapshotDir, "removed-story--default-chromium.png", "orphan");
      const source = path.join(current.root, "src/Button.stories.ts");
      const future = new Date(Date.now() + 10_000);
      utimesSync(source, future, future);

      const report = await runVisualDeltaDoctor(
        { root: current.root },
        dependencies(),
      );

      expect(report.resolved.indexFresh).toBe(false);
      expect(report.inventory).toContainEqual(
        expect.objectContaining({
          path: "removed-story--default-chromium.png",
          kind: "unverified-baseline",
        }),
      );
      expect(report.inventory.some((item) => item.kind === "orphan-baseline"))
        .toBe(false);
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("moves valid v4 evidence, quarantines legacy companions, and migrates caches without touching baselines", async () => {
    const current = fixture();
    try {
      const baseline = Buffer.from("baseline");
      const actual = Buffer.from("actual");
      const diff = Buffer.from("diff");
      const baselinePath = write(
        current.snapshotDir,
        "components-button--primary-chromium.png",
        baseline,
      );
      write(
        current.snapshotDir,
        "components-button--primary-chromium.actual.png",
        actual,
      );
      write(
        current.snapshotDir,
        "components-button--primary-chromium.diff.png",
        diff,
      );
      write(
        current.snapshotDir,
        "components-button--primary-chromium.result.json",
        `${JSON.stringify({
          version: 4,
          storyId: "components-button--primary",
          snapshotRel: "components-button--primary.png",
          status: "passed",
          runnerStatus: "passed",
          outcome: "passed",
          generatedAt: "2026-08-03T00:00:00.000Z",
          tool: "playwright",
          operationId: "operation-1",
          baselineHash: hash(baseline),
          actualHash: hash(actual),
          captureConfigHash: "config-1",
          actualRel: "components-button--primary-chromium.actual.png",
          diffRel: "components-button--primary-chromium.diff.png",
        })}\n`,
      );
      const legacyBaseline = write(
        current.snapshotDir,
        "legacy-chromium-darwin.png",
        "legacy-baseline",
      );
      write(
        current.snapshotDir,
        "legacy-chromium-darwin.actual.png",
        "legacy-actual",
      );
      write(
        current.snapshotDir,
        "legacy-chromium-darwin.diff.png",
        "legacy-diff",
      );
      write(
        current.snapshotDir,
        "legacy-chromium-darwin.json",
        `${JSON.stringify({
          version: 1,
          storyId: "legacy--story",
          snapshotRel: "legacy.png",
          status: "passed",
          generatedAt: "2026-08-03T00:00:00.000Z",
          tool: "playwright",
        })}\n`,
      );
      write(
        current.root,
        ".cache/visual-delta/change-sets/index.json",
        '{"version":1,"changeSets":[]}\n',
      );
      const before = new Map([
        [baselinePath, hash(readFileSync(baselinePath))],
        [legacyBaseline, hash(readFileSync(legacyBaseline))],
      ]);

      const report = await runVisualDeltaDoctor(
        { root: current.root, fix: true },
        {
          ...dependencies(),
          now: () => new Date("2026-08-03T12:00:00.000Z"),
          randomId: () => "run-1",
        },
      );

      const artifactRoot = path.join(current.root, ".visual-delta/artifacts");
      expect(
        existsSync(
          path.join(
            artifactRoot,
            "components-button--primary-chromium.actual.png",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(path.join(current.root, ".cache/visual-delta")),
      ).toBe(false);
      expect(
        existsSync(
          path.join(
            artifactRoot,
            "components-button--primary-chromium.result.json",
          ),
        ),
      ).toBe(true);
      const quarantine = path.join(
        current.root,
        ".visual-delta/cache/doctor-quarantine/2026-08-03T12-00-00-000Z-run-1",
      );
      expect(existsSync(path.join(quarantine, "manifest.json"))).toBe(true);
      expect(
        existsSync(
          path.join(
            current.root,
            ".visual-delta/cache/change-sets/index.json",
          ),
        ),
      ).toBe(true);
      for (const [filePath, expected] of before) {
        expect(existsSync(filePath)).toBe(true);
        expect(hash(readFileSync(filePath))).toBe(expected);
      }
      expect(report.fixes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "move-derived", status: "applied" }),
          expect.objectContaining({ kind: "quarantine", status: "applied" }),
          expect.objectContaining({
            kind: "migrate-change-set-cache",
            status: "applied",
          }),
        ]),
      );
      expect(
        report.inventory.some((item) => item.kind === "legacy-derived"),
      ).toBe(false);
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("never overwrites a derived destination and retains every source on collision", async () => {
    const current = fixture();
    try {
      const baseline = Buffer.from("baseline");
      const actual = Buffer.from("actual");
      write(
        current.snapshotDir,
        "components-button--primary-chromium.png",
        baseline,
      );
      const actualSource = write(
        current.snapshotDir,
        "components-button--primary-chromium.actual.png",
        actual,
      );
      const diffSource = write(
        current.snapshotDir,
        "components-button--primary-chromium.diff.png",
        "diff",
      );
      const resultSource = write(
        current.snapshotDir,
        "components-button--primary-chromium.result.json",
        `${JSON.stringify({
          version: 4,
          storyId: "components-button--primary",
          snapshotRel: "components-button--primary.png",
          status: "passed",
          runnerStatus: "passed",
          outcome: "passed",
          generatedAt: "2026-08-03T00:00:00.000Z",
          tool: "playwright",
          operationId: "operation-1",
          baselineHash: hash(baseline),
          actualHash: hash(actual),
          captureConfigHash: "config-1",
          actualRel: "components-button--primary-chromium.actual.png",
          diffRel: "components-button--primary-chromium.diff.png",
        })}\n`,
      );
      const destination = write(
        current.root,
        ".visual-delta/artifacts/components-button--primary-chromium.actual.png",
        "existing",
      );

      const report = await runVisualDeltaDoctor(
        { root: current.root, fix: true },
        dependencies(),
      );

      expect(readFileSync(destination, "utf8")).toBe("existing");
      expect([actualSource, diffSource, resultSource].every(existsSync)).toBe(true);
      expect(report.ok).toBe(false);
      expect(report.fixes).toContainEqual(
        expect.objectContaining({ kind: "move-derived", status: "failed" }),
      );
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("quarantines a v4 trio whose recorded hashes do not match its files", async () => {
    const current = fixture();
    try {
      write(
        current.snapshotDir,
        "components-button--primary-chromium.png",
        "baseline",
      );
      write(
        current.snapshotDir,
        "components-button--primary-chromium.actual.png",
        "actual",
      );
      write(
        current.snapshotDir,
        "components-button--primary-chromium.diff.png",
        "diff",
      );
      write(
        current.snapshotDir,
        "components-button--primary-chromium.result.json",
        `${JSON.stringify({
          version: 4,
          storyId: "components-button--primary",
          snapshotRel: "components-button--primary.png",
          status: "passed",
          runnerStatus: "passed",
          outcome: "passed",
          generatedAt: "2026-08-03T00:00:00.000Z",
          tool: "playwright",
          operationId: "operation-1",
          baselineHash: "stale-baseline",
          actualHash: "stale-actual",
          captureConfigHash: "config-1",
          actualRel: "components-button--primary-chromium.actual.png",
          diffRel: "components-button--primary-chromium.diff.png",
        })}\n`,
      );

      const report = await runVisualDeltaDoctor(
        { root: current.root },
        dependencies(),
      );

      expect(report.inventory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "legacy-derived", fixable: true }),
        ]),
      );
      expect(report.fixes).toContainEqual(
        expect.objectContaining({ kind: "quarantine", status: "available" }),
      );
      expect(report.fixes).not.toContainEqual(
        expect.objectContaining({ kind: "move-derived" }),
      );
    } finally {
      rmSync(current.root, { recursive: true, force: true });
    }
  });
});
