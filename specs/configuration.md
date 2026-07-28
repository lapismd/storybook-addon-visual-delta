# Visual Delta configuration

This reference defines every configuration layer and its precedence. It separates durable project policy, story-specific capture settings, host capabilities, environment overrides, and local presentation preferences.

## Normative requirements

These requirements keep configuration precedence explicit and preserve safe defaults.

| ID          | Requirement                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-CONF-001 | Effective capture settings MUST resolve in this order: explicit story value, project default, built-in default. An absent value falls through; a valid falsy value does not.                    |
| VD-CONF-002 | Host options MUST configure integration capabilities and paths. They MUST NOT override an explicit story capture value.                                                                         |
| VD-CONF-003 | `.visual-delta/config.json` MUST be the durable project configuration. The legacy `.visual-delta/playwright.json` MAY supply only the Playwright pass threshold when the project file does not. |
| VD-CONF-004 | `parameters.visualDelta` MUST contain story-owned baseline wiring and story-specific overrides. Interaction entries MUST use `{ id, label, src }`.                                              |
| VD-CONF-005 | Browser storage MUST contain presentation or session preferences only. It MUST NOT authorize writes, change durable capture policy, establish review state, or alter action scope.              |
| VD-CONF-006 | Environment variables MAY select ports and explicitly authorized update modes. Compare-only entry points MUST force snapshot updates off regardless of inherited environment.                   |

## Configuration precedence

The layers resolve from highest to lowest priority:

1. Exact story values in `parameters.visualDelta`
2. Project defaults in `.visual-delta/config.json`
3. Legacy Playwright threshold in `.visual-delta/playwright.json`, for that setting only
4. Built-in defaults

Host options resolve separately. An explicit `visualServerPort` host option wins, followed by `VISUAL_SERVER_PORT` or `VISUAL_DELTA_SERVER_PORT`, then `STORYBOOK_PORT + 1`, then the package fallback.

Local panel preferences can change how one browser displays a comparison. They do not change the effective capture configuration sent to Playwright.

## Project configuration

`.visual-delta/config.json` contains the editable default keys and MAY contain a `workflow` object. Readers MAY accept the older `projectDefaults` wrapper. Unknown or invalid editable keys MUST produce diagnostics and MUST NOT be applied.

The built-in project defaults are:

| Setting                   | Built-in value   | Valid values                                |
| ------------------------- | ---------------- | ------------------------------------------- |
| `passThresholdPercent`    | `1`              | Number from `0` to `100`                    |
| `diffThreshold`           | `0.2`            | Number from `0` to `1`                      |
| `diffIncludeAntiAliasing` | `false`          | Boolean                                     |
| `delay`                   | `0`              | Integer from `0` to `60000` ms              |
| `cropToViewport`          | `false`          | Boolean                                     |
| `placement`               | `right`          | `left`, `right`, `above`, `below`, `center` |
| `opacity`                 | `0.5`            | Number from `0` to `1`                      |
| `baselineLabelOffset`     | `{ x: 0, y: 0 }` | Each value from `-1000` to `1000`           |
| `previewSplitZoomDefault` | `fit`            | `fit` or `100%`                             |
| `diffResultZoomDefault`   | `100%`           | `fit` or `100%`                             |

An explicitly injected story value, including `passThresholdPercent: 0.1`, is a story override and wins over the project default of `1`. Implementations MUST expose the winning source so the panel can explain the effective value.

The workflow defaults are:

| Setting                                   | Built-in value                   | Meaning                                             |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `workflow.autoAcceptLiveStoryComparisons` | `false`                          | Do not change review status after a live comparison |
| `workflow.vcs.mode`                       | `off`                            | Do not prepare or create repository commits         |
| `workflow.vcs.commitMessageTemplate`      | `Visual Delta: {action} {scope}` | Template for an allowed local commit                |

Valid commit message tokens are `{action}`, `{scope}`, `{storyId}`, `{storyName}`, and `{count}`.

## Story parameters

`parameters.visualDelta` MAY define:

| Field                     | Contract                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `images`                  | One URL or image entries for primary and mode baselines               |
| `interactions`            | Array of `{ id, label, src }` interaction baselines                   |
| `modes`                   | Named global combinations, optionally with a baseline `src`           |
| `anchor`                  | Selector or anchor used by compatible overlay behavior                |
| `offsetX`, `offsetY`      | Numeric display offsets                                               |
| `align`                   | `viewport` or `canvas`                                                |
| `placement`               | Current values plus legacy `beside` and `over`, normalized at runtime |
| `opacity`                 | Display opacity from `0` to `1`                                       |
| `baselineLabelOffset`     | Baseline chip offset                                                  |
| `colorInversion`          | Display-only inversion flag                                           |
| `passThresholdPercent`    | Allowed differing-pixel percentage                                    |
| `diffThreshold`           | Per-pixel color threshold from `0` to `1`                             |
| `diffIncludeAntiAliasing` | Whether anti-aliased pixels count                                     |
| `delay`                   | Additional settle delay in milliseconds                               |
| `ignoreSelectors`         | CSS selectors whose painted regions do not count                      |
| `cropToViewport`          | Capture the viewport instead of the component subject                 |

Primary image entries MAY carry `deviceScaleFactor`, `viewport`, `mode`, `align`, `placement`, offsets, and anchor metadata. Legacy placement values MUST normalize to `right` for `beside` and `center` for `over`.

## Host options

`options.visualDelta` MAY define:

| Option                        | Purpose                                        | Default                                    |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `showToolbarStatusLabels`     | Show named toolbar review status               | `true`                                     |
| `root`                        | Repository root for paths and spawned commands | Vite root or current working directory     |
| `snapshotDir`                 | Baseline directory                             | `tests/visual/storybook.spec.ts-snapshots` |
| `baselinePathMode`            | Baseline identity strategy                     | `story-id`                                 |
| `addonSrcDir`                 | Local addon source watch path                  | unset                                      |
| `visualUpdateArgs`            | Approved primary writer command                | Packaged `visual-delta update`             |
| `visualInteractionUpdateArgs` | Approved interaction writer command            | Packaged `visual-delta interaction-update` |
| `visualTestArgs`              | Compare-only command                           | `pnpm exec playwright test`                |
| `visualServerPort`            | Static Storybook server port                   | Storybook port plus one                    |
| `allowRebuild`                | Permit middleware-triggered static builds      | `true`                                     |
| `allowVcsWrites`              | Second gate for plugin-managed commits         | `false`                                    |
| `affectedTests`               | Affected cache, external, and untraced policy  | disabled unless configured                 |

`affectedTests.untraced` reduces coverage and MUST remain opt-in. Invalid affected configuration MUST fall back to a full eligible-story selection.

## Browser storage

The panel stores display settings under `storybook-addon-visual-delta/settings`. It MAY persist overlay visibility, placement, opacity, inversion, live visibility, and per-engine display thresholds.

The Testing Module stores compare, baseline-write, result-status, affected-only, and baseline-mode preferences under versioned keys. Its safe defaults are compare on, baseline writes off, result-status updates off, affected-only on, and create-missing mode.

Session storage MAY retain interaction parking, a pinned interaction source, and reconnectable run identifiers. Every session value MUST be disposable.

## Environment variables

The supported process controls are:

| Variable                              | Contract                                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| `STORYBOOK_PORT`                      | Base Storybook port                                                  |
| `VISUAL_SERVER_PORT`                  | Preferred explicit static server port                                |
| `VISUAL_DELTA_SERVER_PORT`            | Legacy static server port alias                                      |
| `VISUAL_DELTA_PASS_THRESHOLD_PERCENT` | Explicit process override for the Playwright threshold               |
| `VISUAL_DELTA_BASELINE_PATH_MODE`     | CLI-to-suite path mode                                               |
| `VISUAL_DELTA_SNAPSHOT_DIR`           | CLI-to-suite snapshot directory                                      |
| `PLAYWRIGHT_UPDATE_SNAPSHOTS`         | Enables writes only when exactly `1` and an approved writer set it   |
| `PLAYWRIGHT_UPDATE_MODE`              | `missing` for create-only, otherwise all requested targets           |
| `VISUAL_UPDATE_APPROVED`              | Explicit baseline-write approval when exactly `1`                    |
| `PLAYWRIGHT_INTERACTION_CAPTURE`      | Exact interaction capture request for an approved writer             |
| `CI`                                  | Disables reused servers and limits workers through Playwright config |

Related contracts: [Baseline model](./baseline-model.md), [Capture and comparison](./capture-and-comparison.md), [Mutations and review](./mutations-and-review.md), and [UI catalog host profile](./host-profile.md).
