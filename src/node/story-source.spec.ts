import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { combineTags } from "storybook/internal/csf";
import { describe, expect, it } from "vitest";
import {
  injectTypeScriptStoryBaselines,
  patchStorySourceText,
  patchStoryVisualReviewStatus,
  patchStoryVisualReviewStatuses,
} from "./story-source.js";
import type { StoryIndexEntry } from "./snapshot-paths.js";

const failingFormatter = {
  command: process.execPath,
  args: [
    "-e",
    'process.stderr.write("deliberate formatter failure"); process.exit(2);',
    "{filePath}",
  ],
};

const entry: StoryIndexEntry = {
  id: "workspace-shell-demo--light",
  exportName: "Light",
  importPath: "src/demo.stories.ts",
};

describe("TypeScript CSF source support", () => {
  it("adds and removes visual tags without disturbing story behavior", () => {
    const source = `
export const Light: Story = {
  args: { theme: "light" },
  play: async () => {},
};
`;
    const skipped = patchStorySourceText(source, entry, {
      kind: "skip",
      skip: true,
    });
    expect(skipped).toContain('tags: ["skip-visual"]');
    expect(skipped).toContain('args: { theme: "light" }');
    expect(skipped).toContain("play: async () => {}");

    const restored = patchStorySourceText(skipped, entry, {
      kind: "skip",
      skip: false,
    });
    expect(restored).toContain("tags: []");

    const reviewed = patchStorySourceText(restored, entry, {
      kind: "review",
      status: "pending",
    });
    expect(reviewed).toContain(
      'tags: ["visual-pending", "!visual-approved", "!visual-ready", "!visual-failed"]',
    );
  });

  it("injects a Visual Delta parameter into an exported story", () => {
    const source = "export const Light: Story = {};\n";
    const next = patchStorySourceText(source, entry, {
      kind: "baseline",
      url: "/visual-baselines/workspace-shell-demo--light-chromium.png",
    });
    expect(next).toContain("parameters:");
    expect(next).toContain("visualDelta:");
    expect(next).toContain("workspace-shell-demo--light-chromium.png");
  });

  it("removes one exact primary image and keeps sibling images", () => {
    const target = "/visual-baselines/workspace/demo/light-chromium.png";
    const sibling =
      "/visual-baselines/workspace/demo/light--dark-chromium.png";
    const source = `export const Light: Story = {
  parameters: {
    visualDelta: {
      images: [${JSON.stringify(target)}, ${JSON.stringify(sibling)}],
      opacity: 0.5,
    },
  },
};\n`;
    const next = patchStorySourceText(source, entry, {
      kind: "remove-baseline",
      url: target,
    });
    expect(next).not.toContain(target);
    expect(next).toContain(sibling);
    expect(next).toContain('"opacity":0.5');
  });

  it("removes an exact named-mode image without dropping its globals", () => {
    const target =
      "/visual-baselines/workspace/demo/light--dark-chromium.png";
    const source = `export const Light: Story = {
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/workspace/demo/light-chromium.png"],
      modes: {
        dark: { src: ${JSON.stringify(target)}, globals: { colorMode: "dark" } },
      },
    },
  },
};\n`;
    const next = patchStorySourceText(source, entry, {
      kind: "remove-baseline",
      url: target,
    });
    expect(next).not.toContain(target);
    expect(next).toContain('"globals":{"colorMode":"dark"}');
    expect(next).toContain("light-chromium.png");
  });

  it("removes one exact Svelte interaction baseline", () => {
    const svelteEntry: StoryIndexEntry = {
      id: "demo--light",
      name: "Light",
      importPath: "src/Demo.stories.svelte",
    };
    const target = "/visual-baselines/demo/light--opens-chromium.png";
    const source = `<Story name="Light" parameters={{
  visualDelta: {
    images: ["/visual-baselines/demo/light-chromium.png"],
    interactions: [
      { id: "opens", label: "Opens", src: ${JSON.stringify(target)} },
      { id: "closes", label: "Closes", src: "/visual-baselines/demo/light--closes-chromium.png" },
    ],
  },
}}>\n`;
    const next = patchStorySourceText(source, svelteEntry, {
      kind: "remove-baseline",
      url: target,
      interactionId: "opens",
    });
    expect(next).not.toContain(target);
    expect(next).not.toContain('"id":"opens"');
    expect(next).toContain('"id":"closes"');
    expect(next).toContain("light-chromium.png");
  });

  it("updates only allow-listed Visual Delta values in a Svelte story", () => {
    const svelteEntry: StoryIndexEntry = {
      id: "demo--light",
      name: "Light",
      importPath: "src/Demo.stories.svelte",
    };
    const source = `<Story name="Light" tags={["visual-ready"]} parameters={{
  visualDelta: {
    images: ["/visual-baselines/demo/light-chromium.png"],
    align: "canvas",
    opacity: 0.5,
  },
}}>\n`;
    const next = patchStorySourceText(source, svelteEntry, {
      kind: "story-config",
      values: { align: "viewport", delay: 250 },
      unset: ["opacity"],
    });
    expect(next).toContain('"align":"viewport"');
    expect(next).toContain('"delay":250');
    expect(next).not.toContain('"opacity"');
    expect(next).toContain("light-chromium.png");
    expect(next).toContain('tags={["visual-ready"]}');
  });

  it("updates Visual Delta values in a TypeScript story", () => {
    const source = `export const Light: Story = {
  tags: ["visual-ready"],
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/demo/light-chromium.png"],
      align: "canvas",
    },
  },
};\n`;
    const next = patchStorySourceText(source, entry, {
      kind: "story-config",
      values: { align: "viewport", cropToViewport: true },
      unset: [],
    });
    expect(next).toContain('"align":"viewport"');
    expect(next).toContain('"cropToViewport":true');
    expect(next).toContain("light-chromium.png");
    expect(next).toContain('tags: ["visual-ready"]');
  });

  it("clears review tags without removing non-visual tags", () => {
    const source = `export const Light: Story = {
  tags: ["visual-approved", "docs-only"],
};\n`;
    const next = patchStorySourceText(source, entry, {
      kind: "clear-review",
    });
    expect(next).toContain(
      'tags: ["docs-only", "!visual-pending", "!visual-approved", "!visual-ready", "!visual-failed"]',
    );
    expect(next).not.toContain('"visual-approved"');
  });

  it("negates inherited component review tags when setting a story status", () => {
    const source = `
const meta = {
  title: "Demo/Comprehensive",
  tags: ["visual-pending"],
};
export default meta;
export const Light: Story = {
  tags: ["visual-approved", "!visual-failed"],
};
`;
    const next = patchStorySourceText(source, entry, {
      kind: "review",
      status: "approved",
    });
    const localLiteral = next.match(
      /export const Light[\s\S]*?tags:\s*(\[[^\]]*\])/,
    )?.[1];
    expect(localLiteral).toBeDefined();
    const localTags = JSON.parse(localLiteral!) as string[];

    expect(localTags).toEqual([
      "visual-approved",
      "!visual-pending",
      "!visual-ready",
      "!visual-failed",
    ]);
    expect(combineTags("visual-pending", ...localTags)).toEqual([
      "visual-approved",
    ]);
  });

  it("normalizes inherited review tags through the host status-update path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-story-review-"));
    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(root, "storybook-static"), { recursive: true });
      const storyPath = path.join(root, "src/demo.stories.ts");
      writeFileSync(
        storyPath,
        `const meta = { tags: ["visual-pending"] };
export default meta;
export const Light = { tags: ["visual-approved"] };
`,
      );
      writeFileSync(
        path.join(root, "storybook-static/index.json"),
        JSON.stringify({
          entries: {
            [entry.id]: {
              ...entry,
              importPath: "./src/demo.stories.ts",
              tags: ["visual-pending", "visual-approved"],
            },
          },
        }),
      );

      expect(
        patchStoryVisualReviewStatus({
          packageRoot: root,
          storyId: entry.id,
          status: "approved",
        }),
      ).toEqual({
        ok: true,
        storyId: entry.id,
        status: "approved",
      });

      const source = readFileSync(storyPath, "utf8");
      expect(source).toContain(
        'tags: ["visual-approved", "!visual-pending", "!visual-ready", "!visual-failed"]',
      );
      const index = JSON.parse(
        readFileSync(path.join(root, "storybook-static/index.json"), "utf8"),
      ) as { entries: Record<string, { tags: string[] }> };
      expect(index.entries[entry.id]?.tags).toEqual(["visual-approved"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stages stories from one CSF and physically writes that source once", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-story-review-batch-"));
    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(root, "storybook-static"), { recursive: true });
      const storyPath = path.join(root, "src/demo.stories.ts");
      writeFileSync(
        storyPath,
        `export const Light = { tags: ["visual-pending"] };
export const Dark = { tags: ["visual-pending"] };
`,
      );
      writeFileSync(
        path.join(root, "storybook-static/index.json"),
        JSON.stringify({
          entries: {
            "demo--light": {
              id: "demo--light",
              exportName: "Light",
              importPath: "./src/demo.stories.ts",
              tags: ["visual-pending"],
            },
            "demo--dark": {
              id: "demo--dark",
              exportName: "Dark",
              importPath: "./src/demo.stories.ts",
              tags: ["visual-pending"],
            },
          },
        }),
      );

      const result = patchStoryVisualReviewStatuses({
        packageRoot: root,
        updates: [
          { storyId: "demo--light", status: "ready" },
          { storyId: "demo--dark", status: "approved" },
        ],
      });

      expect(result).toEqual({
        ok: true,
        updated: 2,
        errors: [],
        sourceFilesUpdated: [storyPath],
      });
      const source = readFileSync(storyPath, "utf8");
      expect(source).toContain(
        'export const Light = { tags: ["visual-ready", "!visual-pending", "!visual-approved", "!visual-failed"]};',
      );
      expect(source).toContain(
        'export const Dark = { tags: ["visual-approved", "!visual-pending", "!visual-ready", "!visual-failed"]};',
      );
      const index = JSON.parse(
        readFileSync(path.join(root, "storybook-static/index.json"), "utf8"),
      ) as { entries: Record<string, { tags: string[] }> };
      expect(index.entries["demo--light"]?.tags).toEqual(["visual-ready"]);
      expect(index.entries["demo--dark"]?.tags).toEqual([
        "visual-approved",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not write any staged review status when one batch item is invalid", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-story-review-invalid-"));
    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(root, "storybook-static"), { recursive: true });
      const storyPath = path.join(root, "src/demo.stories.ts");
      const source = `export const Light = { tags: ["visual-pending"] };\n`;
      const indexPath = path.join(root, "storybook-static/index.json");
      const indexSource = JSON.stringify({
        entries: {
          "demo--light": {
            id: "demo--light",
            exportName: "Light",
            importPath: "./src/demo.stories.ts",
            tags: ["visual-pending"],
          },
        },
      });
      writeFileSync(storyPath, source);
      writeFileSync(indexPath, indexSource);

      expect(
        patchStoryVisualReviewStatuses({
          packageRoot: root,
          updates: [
            { storyId: "demo--light", status: "ready" },
            { storyId: "demo--missing", status: "approved" },
          ],
        }),
      ).toEqual({
        ok: false,
        updated: 0,
        errors: [
          {
            storyId: "demo--missing",
            error: "Story not found in index: demo--missing",
          },
        ],
        sourceFilesUpdated: [],
      });
      expect(readFileSync(storyPath, "utf8")).toBe(source);
      expect(readFileSync(indexPath, "utf8")).toBe(indexSource);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not write source or index state when formatting fails", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-story-review-format-"));
    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(root, "storybook-static"), { recursive: true });
      const storyPath = path.join(root, "src/demo.stories.ts");
      const source = `export const Light = { tags: ["visual-pending"] };\n`;
      const indexPath = path.join(root, "storybook-static/index.json");
      const indexSource = JSON.stringify({
        entries: {
          "demo--light": {
            id: "demo--light",
            exportName: "Light",
            importPath: "./src/demo.stories.ts",
            tags: ["visual-pending"],
          },
        },
      });
      writeFileSync(storyPath, source);
      writeFileSync(indexPath, indexSource);

      const result = patchStoryVisualReviewStatuses({
        packageRoot: root,
        updates: [{ storyId: "demo--light", status: "approved" }],
        sourceFormatter: failingFormatter,
      });

      expect(result.ok).toBe(false);
      expect(result.updated).toBe(0);
      expect(result.sourceFilesUpdated).toEqual([]);
      expect(result.errors).toEqual([
        {
          storyId: "demo--light",
          error: expect.stringContaining("deliberate formatter failure"),
        },
      ]);
      expect(readFileSync(storyPath, "utf8")).toBe(source);
      expect(readFileSync(indexPath, "utf8")).toBe(indexSource);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps only one visual review tag when swapping ready ↔ failed", () => {
    const svelteEntry: StoryIndexEntry = {
      id: "demo--light",
      name: "Light",
      importPath: "src/Demo.stories.svelte",
    };
    const source = `<Story name="Light" tags={["visual-failed", "upstream-example"]}>\n`;
    const ready = patchStorySourceText(source, svelteEntry, {
      kind: "review",
      status: "ready",
    });
    expect(ready).toContain('"visual-ready"');
    expect(ready).toContain('"upstream-example"');
    expect(ready).toContain('"!visual-pending"');
    expect(ready).toContain('"!visual-approved"');
    expect(ready).toContain('"!visual-failed"');
    expect(ready).not.toContain('"visual-failed"');

    const failed = patchStorySourceText(ready, svelteEntry, {
      kind: "review",
      status: "failed",
    });
    expect(failed).toContain('"visual-failed"');
    expect(failed).toContain('"!visual-pending"');
    expect(failed).toContain('"!visual-approved"');
    expect(failed).toContain('"!visual-ready"');
    expect(failed).not.toContain('"visual-ready"');
  });

  it("baseline wiring clears visual-pending when stamping ready", () => {
    const svelteEntry: StoryIndexEntry = {
      id: "demo--light",
      name: "Light",
      importPath: "src/Demo.stories.svelte",
    };
    const source = `<Story name="Light" tags={["visual-pending", "visual-approved"]}>\n`;
    const next = patchStorySourceText(source, svelteEntry, {
      kind: "baseline",
      url: "/visual-baselines/forms/demo/light-chromium.png",
      reviewStatus: "ready",
    });
    expect(next).toContain("visualDelta");
    expect(next).toContain('"visual-ready"');
    expect(next).not.toContain('"visual-pending"');
    expect(next).not.toContain('"visual-approved"');
  });

  it("injects story-id baselines during Vite transforms", () => {
    const source = `
const meta = { title: "Workspace shell/Demo" };
export default meta;
export const Light: Story = {};
export const DarkMode: Story = { args: { theme: "dark" } };
`;
    const next = injectTypeScriptStoryBaselines(
      source,
      "Workspace shell/Demo",
      "story-id",
      () => true,
    );
    expect(next).toContain(
      "/visual-baselines/workspace-shell-demo--light-chromium.png",
    );
    expect(next).toContain(
      "/visual-baselines/workspace-shell-demo--dark-mode-chromium.png",
    );
  });
});
