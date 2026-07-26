import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AFFECTED_VISUAL_CACHE_FILE,
  matchesAffectedGlob,
  normalizeStatsModuleId,
  planAffectedVisualTests,
  recordAffectedVisualResults,
} from "./affected-visual-tests.js";
import type { VisualDeltaHostOptions } from "./options.js";

type Fixture = ReturnType<typeof createFixture>;
const roots: string[] = [];

function write(root: string, relative: string, contents: string): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

function story(
  id: string,
  importPath: string,
): {
  id: string;
  type: "story";
  importPath: string;
  tags: string[];
} {
  return { id, type: "story", importPath, tags: ["test"] };
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "visual-delta-affected-"));
  roots.push(root);
  const entries = {
    "button--primary": story("button--primary", "./src/Button.stories.ts"),
    "card--primary": story("card--primary", "./src/Card.stories.ts"),
    "hidden--primary": {
      ...story("hidden--primary", "./src/Hidden.stories.ts"),
      tags: ["test", "skip-visual"],
    },
  };
  const modules = [
    {
      id: "/virtual:/@storybook/builder-vite/vite-app.js",
      reasons: [{ moduleName: "./iframe.html" }],
    },
    {
      id: "./src/Button.stories.ts",
      reasons: [{ moduleName: "/virtual:/storybook-stories.js" }],
    },
    {
      id: "./src/Card.stories.ts",
      reasons: [{ moduleName: "/virtual:/storybook-stories.js" }],
    },
    {
      id: "./src/Button.ts",
      reasons: [
        { moduleName: "./src/Button.stories.ts" },
        { moduleName: "./src/Cycle.ts" },
      ],
    },
    {
      id: "./src/Card.ts",
      reasons: [{ moduleName: "./src/Card.stories.ts" }],
    },
    {
      id: "./src/Shared.ts",
      reasons: [
        { moduleName: "./src/Button.ts" },
        { moduleName: "./src/Card.ts" },
      ],
    },
    {
      id: "./src/Cycle.ts",
      reasons: [{ moduleName: "./src/Button.ts" }],
    },
    {
      id: "./src/theme.css",
      reasons: [{ moduleName: "./.storybook/preview.ts" }],
    },
  ];

  write(root, "package.json", '{"name":"fixture"}\n');
  write(root, "src/Button.stories.ts", "export const Primary = {};\n");
  write(root, "src/Card.stories.ts", "export const Primary = {};\n");
  write(root, "src/Hidden.stories.ts", "export const Primary = {};\n");
  write(root, "src/Button.ts", "export const button = true;\n");
  write(root, "src/Card.ts", "export const card = true;\n");
  write(root, "src/Shared.ts", "export const shared = true;\n");
  write(root, "src/Cycle.ts", "export const cycle = true;\n");
  write(root, "src/theme.css", ":root { color: red; }\n");
  write(root, ".storybook/preview.ts", 'import "../src/theme.css";\n');
  write(root, "storybook-static/index.json", JSON.stringify({ entries }));
  write(
    root,
    ".cache/visual-delta/preview-stats.json",
    JSON.stringify({ modules }),
  );

  const hostOptions: VisualDeltaHostOptions = {
    baselinePathMode: "story-id",
    affectedTests: {},
  };
  return { root, entries, modules, hostOptions };
}

function rewriteGraph(fixture: Fixture): void {
  write(
    fixture.root,
    "storybook-static/index.json",
    JSON.stringify({ entries: fixture.entries }),
  );
  write(
    fixture.root,
    ".cache/visual-delta/preview-stats.json",
    JSON.stringify({ modules: fixture.modules }),
  );
}

function seed(
  fixture: Fixture,
  passedStoryIds: string[] = ["button--primary", "card--primary"],
): void {
  expect(
    recordAffectedVisualResults({
      root: fixture.root,
      hostOptions: fixture.hostOptions,
      passedStoryIds,
    }),
  ).toBe(true);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("affected visual graph normalization", () => {
  it("normalizes project modules and rejects virtual or external modules", () => {
    const root = "/repo";
    expect(normalizeStatsModuleId("./src/Button.ts?direct", root)).toBe(
      "src/Button.ts",
    );
    expect(
      normalizeStatsModuleId("/virtual:/vite-app.js", root),
    ).toBeUndefined();
    expect(
      normalizeStatsModuleId("/other/repo/Button.ts", root),
    ).toBeUndefined();
  });

  it("supports recursive and single-segment globs", () => {
    expect(matchesAffectedGlob("vendor/icons/add.svg", ["vendor/**"])).toBe(
      true,
    );
    expect(matchesAffectedGlob("src/Button.ts", ["src/*.ts"])).toBe(true);
    expect(matchesAffectedGlob("src/deep/Button.ts", ["src/*.ts"])).toBe(false);
  });
});

describe("affected visual planner", () => {
  it("falls back to all runnable stories on a cold cache", () => {
    const fixture = createFixture();
    const plan = planAffectedVisualTests(fixture.root, fixture.hostOptions);
    expect(plan.summary).toMatchObject({
      selected: 2,
      unchanged: 0,
      total: 2,
      noChange: false,
      fallbackReason: "Affected cache is missing",
    });
    expect(plan.selectedStoryIds).toEqual(["button--primary", "card--primary"]);
  });

  it("returns an exit-zero no-op after every story passed unchanged", () => {
    const fixture = createFixture();
    seed(fixture);
    const plan = planAffectedVisualTests(fixture.root, fixture.hostOptions);
    expect(plan.summary).toMatchObject({
      selected: 0,
      unchanged: 2,
      total: 2,
      noChange: true,
    });
    expect(plan.needsRebuild).toBe(false);
  });

  it("treats omitted and empty affected globs as the same configuration", () => {
    const fixture = createFixture();
    seed(fixture);
    fixture.hostOptions.affectedTests = { externals: [], untraced: [] };
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .noChange,
    ).toBe(true);
  });

  it("selects only the leaf story through cycles", () => {
    const fixture = createFixture();
    seed(fixture);
    write(fixture.root, "src/Button.ts", "export const button = false;\n");
    const plan = planAffectedVisualTests(fixture.root, fixture.hostOptions);
    expect(plan.selectedStoryIds).toEqual(["button--primary"]);
    expect(plan.summary.unchanged).toBe(1);
  });

  it("selects every genuine consumer of a shared dependency", () => {
    const fixture = createFixture();
    seed(fixture);
    write(fixture.root, "src/Shared.ts", "export const shared = false;\n");
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions)
        .selectedStoryIds,
    ).toEqual(["button--primary", "card--primary"]);
  });

  it("ignores tooling and README files outside the traced graph", () => {
    const fixture = createFixture();
    seed(fixture);
    write(fixture.root, "README.md", "Documentation only.\n");
    write(fixture.root, "tools/report.txt", "No rendering impact.\n");
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .noChange,
    ).toBe(true);
  });

  it("falls back for preview dependencies, package files, and externals", () => {
    const fixture = createFixture();
    fixture.hostOptions.affectedTests = {
      externals: ["vendor/static/**"],
    };
    write(fixture.root, "vendor/static/icon.svg", "<svg />\n");
    seed(fixture);

    write(fixture.root, "src/theme.css", ":root { color: blue; }\n");
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .fallbackReason,
    ).toContain("Storybook preview dependency changed");

    seed(fixture);
    write(fixture.root, "package.json", '{"name":"changed"}\n');
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .fallbackReason,
    ).toContain("Global visual-test input changed");

    seed(fixture);
    write(fixture.root, "vendor/static/icon.svg", "<svg>changed</svg>\n");
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .fallbackReason,
    ).toContain("Configured external changed");
  });

  it("allows explicit untraced globs with reduced coverage", () => {
    const fixture = createFixture();
    fixture.hostOptions.affectedTests = {
      untraced: ["src/Shared.ts"],
    };
    seed(fixture);
    write(fixture.root, "src/Shared.ts", "export const shared = false;\n");
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .noChange,
    ).toBe(true);
  });

  it("maps baseline-only changes to their owning story", () => {
    const fixture = createFixture();
    write(
      fixture.root,
      "tests/visual/storybook.spec.ts-snapshots/button--primary-chromium-darwin.png",
      "baseline-one",
    );
    seed(fixture);
    write(
      fixture.root,
      "tests/visual/storybook.spec.ts-snapshots/button--primary-chromium-darwin.png",
      "baseline-two",
    );
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions)
        .selectedStoryIds,
    ).toEqual(["button--primary"]);
  });

  it("keeps failed and timed-out stories affected while cleaning passes", () => {
    const fixture = createFixture();
    seed(fixture, ["button--primary"]);
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions)
        .selectedStoryIds,
    ).toEqual(["card--primary"]);

    write(fixture.root, "src/Shared.ts", "export const shared = false;\n");
    recordAffectedVisualResults({
      root: fixture.root,
      hostOptions: fixture.hostOptions,
      passedStoryIds: ["button--primary"],
    });
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions)
        .selectedStoryIds,
    ).toEqual(["card--primary"]);
  });

  it("handles deleted modules and unresolved new stories conservatively", () => {
    const fixture = createFixture();
    seed(fixture);
    rmSync(path.join(fixture.root, "src/Button.ts"));
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions)
        .selectedStoryIds,
    ).toContain("button--primary");

    write(fixture.root, "src/New.stories.ts", "export const Primary = {};\n");
    Object.assign(fixture.entries, {
      "new--primary": story("new--primary", "./src/New.stories.ts"),
    });
    rewriteGraph(fixture);
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .fallbackReason,
    ).toContain("cannot be resolved");
  });

  it("falls back for invalid cache and graph data", () => {
    const fixture = createFixture();
    seed(fixture);
    write(
      fixture.root,
      `.cache/visual-delta/${AFFECTED_VISUAL_CACHE_FILE}`,
      "{",
    );
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .fallbackReason,
    ).toContain("cache is invalid");

    write(fixture.root, ".cache/visual-delta/preview-stats.json", "{}");
    expect(
      planAffectedVisualTests(fixture.root, fixture.hostOptions).summary
        .fallbackReason,
    ).toContain("Dependency graph is missing or invalid");
  });
});
