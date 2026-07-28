# Visual Delta action scopes

> Historical implementation record. Use the
> [`Visual Delta system specification`](./specs/index.md) for the normative
> contract.

This file tracks the correction of Visual Delta Testing Module and panel action
scopes. Every checked Testing Module action must use one frozen set of story
IDs, and panel review controls must remain independent from Testing Module
preferences.

## Scope contract

| Invocation context      | Effective scope                                              |
| ----------------------- | ------------------------------------------------------------ |
| Story sidebar entry     | Exactly the selected story                                   |
| Component sidebar entry | Every descendant story under the component                   |
| Global Testing Module   | Stories currently visible in the filtered sidebar            |
| Global + Affected only  | Visible stories intersected with the refreshed affected plan |

Enabled actions run in this order:

1. Create or update baselines.
2. Run visual comparisons.
3. Update review status from results.

An empty scope reports `No visible stories` or `Up to date`; it never broadens
to siblings or the complete suite.

## Safety boundaries

- Baseline writers receive exact story IDs. Only explicit component operations
  may select by component.
- Updating pixels clears review only for the stories whose baselines were
  rewritten.
- Accept, Unaccept, Ready, and Failed never depend on Testing Module checkbox
  state.
- The panel's Update baseline action targets only the open story.
- Rebuild storybook static is an explicit panel kebab action. Automatic
  rebuilds required for affected-plan or incomplete-static correctness remain.
- Visual validation remains compare-only unless baseline updates are explicitly
  approved.

## Progress

- [x] Record the scope contract and the Dropdown Menu component-prefix
      regression.
- [x] Centralize and freeze story/component/global scope resolution.
- [x] Add exact batch story-ID baseline writes.
- [x] Make panel baseline updates story-scoped and review actions
      preference-independent.
- [x] Reorder Testing Module actions and remove the rebuild preference.
- [x] Update README and vendor implementation notes.
- [x] Run focused unit, Storybook, panel Playwright, compare-only visual, and
      repository checks; record unrelated aggregate blockers below.

## Follow-up: exact runner selection and baseline actions

- [x] Replace reporter-glyph story selectors with Playwright-compatible exact
      story-ID suffix selectors.
- [x] Verify global comparison results continue into the enabled review-status
      phase.
- [x] Move per-baseline History and Update actions into an accordion kebab.
- [x] Add Delete screenshot to remove the exact CSF image/interaction,
      corresponding local PNG, and derived sidecars without touching siblings.
- [x] Re-run focused unit, manager browser, panel, compare-only, and repository
      checks without updating baselines.

The component/global regression came from treating the list reporter's `›`
separator as part of the title matched by Playwright. Playwright applies grep to
a whitespace-joined internal title, so the selector found zero tests and the
action sequence stopped before the enabled status-update phase. All selected
runners now share a whitespace-delimited, escaped story-ID leaf selector.

## Follow-up: observable global preflight

- [x] Stream resolving, correctness-rebuild, and scope-freezing milestones from
      the global action-scope endpoint.
- [x] Emit an elapsed heartbeat during long `build-storybook` preflights.
- [x] Keep the comparison row idle until the Playwright run actually begins.
- [x] Restore the explicit comparison phase after manager HMR reconnects.
- [x] Cover stream success/failure parsing and preflight UI state with focused
      tests.

## Follow-up: capture geometry and preview remounts

- [x] Restore the longstanding 1.5rem catalog inset for regular fullscreen
      stories so their 1280px viewport captures remain 1232 CSS pixels wide.
- [x] Limit edge-to-edge `#storybook-root` layout to Workspace and Shell story
      groups, preserving their existing 1280 CSS pixel baselines.
- [x] Retry Diff HTML once when Storybook replaces the preview iframe during
      viewport establishment or capture.
- [x] Align wrapped host commands with the main catalog's 9009/9010 port lane so
      compare-only validation cannot reuse another checkout's 6007 server.
- [x] Treat a baseline whose CSS dimensions match its declared capture viewport
      as viewport-sized even when older metadata says `align: "canvas"`, so the
      center overlay uses the viewport origin and does not show a false geometry
      warning.

## Follow-up: story configuration and alignment repair

- [x] Add a story-scoped first tab to Configuration with effective values and
      story/project/built-in source labels.
- [x] Persist only changed, allow-listed `parameters.visualDelta` properties
      for the exact current story, with an explicit reset-overrides action.
- [x] Report high-confidence baseline alignment metadata disagreements without
      breaking the runtime geometry fallback.
- [x] Offer a one-click alignment repair that updates story configuration only;
      never rewrite the PNG or review status.
- [x] Show the alignment warning in the normal comparison notice area and link
      directly to the current story's Configuration tab.
- [x] Cover Svelte and TypeScript story-source updates, middleware validation,
      Configuration UI behavior, and the Popover viewport-alignment regression.

## Validation evidence

- Story-configuration add-on unit suite: 277/277 passed, including source
  resolution/validation, Svelte and TypeScript exact-story patches,
  Configuration editing/repair, and the linked comparison warning.
- Popover manager regression: 2/2 passed for viewport-origin centering and the
  comparison warning → Story configuration → exact `align: "viewport"` repair;
  no PNG or review endpoint was called.
- Add-on typecheck, Node build, static Storybook build, and live catalog review:
  passed. The live panel showed the warning in the normal geometry notice area
  and the Story tab showed effective values/source labels. No baseline update
  command was run.
- Final aggregate `pnpm checks`: formatting, Svelte diagnostics, add-on/docs
  type checks, and the no-Tailwind gate passed; unit tests reached 687/688
  before the same unrelated F-Mode source-shape assertion recorded below
  stopped the command.
- Add-on scope/UI/prefs tests: 18 passed.
- Host middleware/pipeline tests: 29 passed, including the exact Dropdown Menu
  sibling review-reset regression.
- Add-on typecheck, Node build, Svelte check, and static Storybook build:
  passed.
- Targeted panel review workflow: passed with every Testing Module checkbox
  disabled; Accept, Unaccept, Ready, Failed, exact-story Update baseline, and
  kebab Rebuild static all remained available.
- Full panel Playwright: 37 passed; four existing component-overlay Fit
  placement canaries failed because the live subject exceeded its pane
  (full-viewport placements and all new workflow coverage passed).
- Full unit: 679 passed; one existing workspace story-mode contract failed
  because `FMode.stories.svelte` uses the demo helper's `mobileMode: "never"`
  form rather than the contract's older computed-key syntax.
- Storybook interactions: 502 passed; one existing AppShell play test tried to
  click a control under `pointer-events: none`.
- Compare-only visual suite: 277 passed and 84 existing deltas failed, primarily
  the catalog-wide 3840-to-3696 capture-width drift plus the already-modified
  Alert Dialog, Dialog, and Dropdown Menu baselines. No baseline update command
  was run.
- Final `pnpm checks`: formatting, Svelte diagnostics, add-on and docs type
  checks, and the no-Tailwind gate passed; the command then stopped at the same
  existing F-Mode workspace contract failure recorded above.
- Popover center-overlay regression: failed before the fix at `(24, 24)`, then
  passed at the viewport origin `(0, 0)` with no geometry warning.
- Focused compare-only geometry validation: Label, Select Scrollable, Popover
  Open panel, and Workspace Empty View passed without updating baselines.
- Follow-up selector/delete tests: 14 add-on tests and 30 host pipeline tests
  passed, including exact sibling-suffix rejection, primary/interaction/named
  mode removal, review invalidation, and sidecar deletion.
- Popover component regression: Playwright listed exactly the three component
  stories and the compare-only run passed 3/3.
- Updated Visual Delta catalog interactions: focused 33/33 and full Storybook
  503/503 passed.
- Follow-up full panel Playwright: 37 passed with the same four existing
  component-overlay Fit placement canaries; the review/update/delete workflow
  passed. No baseline update command was run.
- Follow-up `pnpm checks`: formatting, Svelte diagnostics, both add-on type
  checks, and the no-Tailwind gate passed; unit tests reached 672/673 before the
  same unrelated F-Mode source-shape assertion stopped the aggregate command.
- Observable-preflight tests: 19 focused add-on tests passed, including streamed
  resolving/rebuilding/freezing phases, failure propagation, action ordering,
  and a non-running comparison row during the rebuild.
- Live slow-path endpoint: a real affected preflight streamed one-second
  `Rebuilding Storybook static… Ns` heartbeats for its full build, then
  `Refreshing affected plan…`, exact-scope freezing, and the final two-story
  frozen result. No baseline writer or visual comparison was invoked.
- Live manager acceptance on port 9009: the global runner immediately displayed
  `Resolving affected scope…`, advanced to the elapsed rebuild heartbeat, and
  kept the comparison row at `Run tests to see results` until comparison began.
- Observable-preflight full add-on suite: 267/267 tests passed; focused
  Storybook Testing Module interactions passed 6/6.
- Compare-only panel Playwright: 29 passed and 12 visual canaries failed. Four
  are the existing component-overlay Fit placement failures; eight show the
  intentional per-baseline kebab replacing the prior inline update icon in
  stale panel snapshots. No baseline update command was run.
- Observable-preflight `pnpm checks`: formatting, Svelte diagnostics, both
  add-on type checks, docs type checks, and the no-Tailwind gate passed; unit
  tests reached 675/676 before the same unrelated F-Mode source-shape
  assertion stopped the aggregate command.
