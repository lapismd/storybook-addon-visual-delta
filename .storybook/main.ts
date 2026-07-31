import type { StorybookConfig } from "@storybook/react-vite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
/** Optional sibling UI catalog checkout (`../ui`) for host-stub baselines. */
const siblingUiRoot = path.resolve(packageRoot, "../ui");
const siblingUiSnapshots = path.join(
  siblingUiRoot,
  "tests/visual/storybook.spec.ts-snapshots",
);
/**
 * Packaged host-stub PNGs for manager acceptance / standalone boots.
 * Manager Playwright sets VISUAL_DELTA_PACKAGE_BASELINES=1 so CI and local
 * acceptance share the same fixture set. Otherwise prefer the sibling UI
 * catalog when present (full product baselines for interactive Storybook).
 */
const packageSnapshotMount = path.join(
  packageRoot,
  "tests/fixtures/visual-baselines",
);
const forcePackageBaselines =
  process.env.VISUAL_DELTA_PACKAGE_BASELINES === "1";
const hostSnapshots =
  !forcePackageBaselines && existsSync(siblingUiSnapshots)
    ? siblingUiSnapshots
    : packageSnapshotMount;
const repoRoot = existsSync(path.join(siblingUiRoot, "package.json"))
  ? siblingUiRoot
  : packageRoot;
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
  features: {
    // Keep manager acceptance free of the Get started checklist chrome.
    sidebarOnboardingChecklist: false,
  },
  // Host snapshotDir is mounted at `/visual-baselines` by the preset. Nested
  // `staticDirs` for `/visual-baselines/examples` are shadowed in Vite dev, so
  // Examples PNGs are also linked from the host snapshot tree when present:
  // `../ui/tests/visual/storybook.spec.ts-snapshots/examples` → this folder.
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
