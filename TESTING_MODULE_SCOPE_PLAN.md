# Visual Delta action scopes

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

## Validation evidence

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
- Full unit: 665 passed; one existing workspace story-mode contract failed
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
