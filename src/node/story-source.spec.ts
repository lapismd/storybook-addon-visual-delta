import { describe, expect, it } from "vitest";
import {
  injectTypeScriptStoryBaselines,
  patchStorySourceText,
} from "./story-source.js";
import type { StoryIndexEntry } from "./snapshot-paths.js";

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
    expect(reviewed).toContain('tags: ["visual-pending"]');
  });

  it("injects a Visual Delta parameter into an exported story", () => {
    const source = "export const Light: Story = {};\n";
    const next = patchStorySourceText(source, entry, {
      kind: "baseline",
      url: "/visual-baselines/workspace-shell-demo--light-chromium-darwin.png",
    });
    expect(next).toContain("parameters:");
    expect(next).toContain("visualDelta:");
    expect(next).toContain("workspace-shell-demo--light-chromium-darwin.png");
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
    expect(ready).not.toContain("visual-failed");

    const failed = patchStorySourceText(ready, svelteEntry, {
      kind: "review",
      status: "failed",
    });
    expect(failed).toContain('"visual-failed"');
    expect(failed).not.toContain("visual-ready");
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
      url: "/visual-baselines/forms/demo/light-chromium-darwin.png",
      reviewStatus: "ready",
    });
    expect(next).toContain("visualDelta");
    expect(next).toContain('"visual-ready"');
    expect(next).not.toContain("visual-pending");
    expect(next).not.toContain("visual-approved");
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
      "/visual-baselines/workspace-shell-demo--light-chromium-darwin.png",
    );
    expect(next).toContain(
      "/visual-baselines/workspace-shell-demo--dark-mode-chromium-darwin.png",
    );
  });
});
