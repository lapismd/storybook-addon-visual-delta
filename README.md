# Visual Delta for Storybook

Visual Delta is a local-first visual regression testing addon for Storybook. It compares stories with committed Playwright screenshots and adds baseline review, overlays, diffs, and visual test controls to Storybook.

## Requirements

- A Storybook project using Vite
- React, which renders the addon panel
- Playwright for browser capture
- Docker for the default authoritative Linux ARM64 capture runner

Visual Delta supports Chromium, Firefox, and WebKit. New projects enable Chromium only.

## Install

From your Storybook project, install and register the addon:

```bash
npx storybook add @lapismd/storybook-addon-visual-delta
pnpm add -D playwright react
pnpm exec playwright install chromium
pnpm exec visual-delta init
```

`visual-delta init` creates the Playwright suite, Playwright configuration, snapshot directory, and package scripts. It preserves existing files unless you pass `--force`.

The generated files are:

```text
playwright.config.ts
tests/visual/storybook.spec.ts
tests/visual/storybook.spec.ts-snapshots/
```

It also adds `build-storybook`, `test:visual`, `test:visual:affected`, and `visual-delta` scripts when they do not already exist.

## Register the addon manually

If the Storybook CLI did not update your configuration, add the package to the existing `addons` array in `.storybook/main.ts`:

```ts
export default {
  addons: ["@lapismd/storybook-addon-visual-delta"],
};
```

If you do not want to use `visual-delta init`, create the suite and Playwright configuration yourself.

```ts
// tests/visual/storybook.spec.ts
import {
  defineVisualSuite,
} from "@lapismd/storybook-addon-visual-delta/playwright";

defineVisualSuite();
```

```ts
// playwright.config.ts
import {
  defineVisualPlaywrightConfig,
} from "@lapismd/storybook-addon-visual-delta/playwright";

export default defineVisualPlaywrightConfig();
```

## Create a baseline

Start Storybook and open a story:

```bash
pnpm storybook
```

Open the **Visual Delta** panel, select the browser, and choose **Create visual**. Review the captured PNG before committing it to your repository.

The default snapshot directory is `tests/visual/storybook.spec.ts-snapshots`. Baseline names contain the story and browser, for example `components-button--primary-chromium.png`.

## Run visual tests

Check the capture environment before the first authoritative run:

```bash
pnpm exec visual-delta harness doctor
```

Run every eligible story:

```bash
pnpm test:visual
```

Run only stories affected by local changes:

```bash
pnpm test:visual:affected
```

Missing baselines and visual mismatches are warnings by default. Use strict mode when they should fail CI:

```bash
pnpm exec visual-delta test --all --failure-mode strict
```

Compare-only commands never create or update baselines.

## Configure browsers and comparison defaults

Add `.visual-delta/config.json` when the built-in defaults are not suitable:

```json
{
  "browsers": ["chromium", "firefox", "webkit"],
  "workflow": {
    "visualTestFailureMode": "strict"
  }
}
```

Install the corresponding local browser binaries when you use live browser comparison:

```bash
pnpm exec playwright install chromium firefox webkit
```

The built-in comparison allows up to `1.5%` differing pixels and uses a `0.2` per-pixel color threshold. Project and story settings can override these values.

The default runner executes authoritative comparisons and writes in the pinned Linux ARM64 capture profile. Projects that cannot use Docker can provide `.visual-delta/runner.mjs` to transport the same capture job through another environment.

## Further documentation

- [System specification](./spec/src/index.md)
- [Configuration reference](./spec/src/configuration.md)
- [Baseline names and artifacts](./spec/src/baseline-model.md)
- [Capture and comparison behavior](./spec/src/capture-and-comparison.md)
- [CLI and public interfaces](./spec/src/interfaces.md)
- [Mutation and review safety](./spec/src/mutations-and-review.md)
- [Contributor guide](./DEVELOPMENT.md)

## License

[MIT](./LICENSE)
