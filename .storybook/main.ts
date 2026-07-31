import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const hostSnapshots = path.join(
  repoRoot,
  "tests/visual/storybook.spec.ts-snapshots",
);
const exampleSnapshots = path.join(
  packageRoot,
  "tests/examples-snapshots/examples",
);

/** Manager Playwright sets this so acceptance story IDs stay in index.json. */
const includeHostStubs = process.env.VISUAL_DELTA_INCLUDE_HOST_STUBS === "1";

const stories: StorybookConfig["stories"] = [
  "../src/stories/docs/**/*.mdx",
  "../src/stories/examples/**/*.mdx",
  "../src/stories/*.mdx",
  "../src/stories/*.stories.@(ts|tsx)",
  "../src/stories/examples/**/*.stories.@(ts|tsx)",
  ...(includeHostStubs
    ? ([
        "../src/stories/host-stubs/**/*.mdx",
        "../src/stories/host-stubs/**/*.stories.@(ts|tsx)",
      ] as const)
    : []),
];

const config: StorybookConfig = {
  stories,
  // Host snapshotDir is mounted at `/visual-baselines` by the preset. Nested
  // `staticDirs` for `/visual-baselines/examples` are shadowed in Vite dev, so
  // Examples PNGs are also linked from the host snapshot tree:
  // `tests/visual/storybook.spec.ts-snapshots/examples` → this folder.
  // Keep this mount for static builds (`build-storybook`) where nesting works.
  staticDirs: [
    {
      from: exampleSnapshots,
      to: "/visual-baselines/examples",
    },
  ],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    {
      name: import.meta.resolve("./local-preset.ts"),
      options: {
        visualDelta: {
          root: repoRoot,
          snapshotDir: hostSnapshots,
          baselinePathMode: "nested-import",
          allowVcsWrites: false,
          showToolbarStatusLabels: true,
          addonSrcDir: path.join(packageRoot, "src"),
        },
      },
    },
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // `/visual-baselines` comes from the Visual Delta preset `staticDirs`.
  // Package Examples PNGs mount at `/visual-baselines/examples` above.
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      plugins: [svelte()],
      resolve: {
        alias: {
          "storybook-addon-visual-delta": packageRoot,
        },
      },
      server: {
        fs: {
          allow: [repoRoot, packageRoot],
        },
      },
      optimizeDeps: {
        exclude: ["storybook-addon-visual-delta"],
      },
    });
  },
};

export default config;
