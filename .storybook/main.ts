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

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
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
