# Visual Delta consistency plan

> Historical implementation record. Use the
> [`Visual Delta system specification`](./specs/index.md) for the normative
> contract.

This document tracks the consistency audit for Visual Delta. It separates
execution state, comparison outcome, and review metadata so every entry point
reports the same result for the same story.

## Action contract

| Action                        | Comparison source                      |                      Automatic static rebuild | State effect                                      |
| ----------------------------- | -------------------------------------- | --------------------------------------------: | ------------------------------------------------- |
| Diff HTML                     | Live browser approximation             |                                         Never | Diagnostic only                                   |
| Diff Chromium / Story         | Authoritative live Chromium comparison |                                         Never | Official exact-story result                       |
| Component/global/affected run | Static Playwright                      | When centrally determined stale or incomplete | Official frozen-scope results                     |
| Create/update baseline        | Static Playwright updater              |                                 When required | Invalidate old result and reset review to pending |
| Review/config/history/delete  | Direct endpoint                        |                                         Never | Only the requested state                          |
| Manual rebuild                | Storybook static                       |                                        Always | No screenshot or review mutation                  |

## Implementation checklist

- [x] Add a backwards-compatible sidecar v2 with separate runner and comparison
      outcomes plus baseline/config freshness identities.
- [x] Make one result classifier authoritative across Playwright, middleware,
      panel summaries, and review updates.
- [x] Treat review tags as metadata only; never as Playwright expectations.
- [x] Route Story and Diff Chromium through the same exact-story comparison.
- [x] Keep Diff HTML diagnostic-only.
- [x] Recheck and explicitly clear geometry/alignment warnings after baseline or
      configuration changes.
- [x] Resolve effective story alignment during baseline hydration.
- [x] Share one static-build decision across all static consumers.
- [x] Preserve exact frozen scopes and baseline → compare → status ordering.
- [x] Audit review, delete, history, modes, interactions, and skip/include
      actions against the contract above.
- [x] Make ordinary Storybook Interactions rows selectable capture points with
      exact-call create/update/replay, not only named `step()` groups.
- [x] Default to interaction baselines only, expose uncaptured calls behind a
      Show all toggle, and render resolved Storybook-style call syntax.
- [x] Update README and VENDOR documentation.

## Validation evidence

Record compare-only evidence here as the checklist lands. Visual baselines must
not be updated by validation.

- Initial feature worktree: isolated above the user's existing Popover story
  change, which remains untouched.
- Baseline policy: compare-only commands only for this implementation.
- Formatting, addon typecheck, and repository Svelte diagnostics: passing.
- Visual Delta unit suite: 72 files and 291 tests passing.
- Focused static-build and host-middleware suites: 9 and 30 tests passing.
- Storybook interaction suite: 181 files and 504 tests passing after the
  optimizer-reload retry; the static Storybook build also passes.
- Browser regression: Popover Story and Diff Chromium both publish the same
  authoritative 0.0000% result, and the corrected viewport alignment publishes
  no stale warning.
- Browser regression: Dropdown Menu reports the real 1280x64 versus 1232x64
  geometry mismatch as a failed exact-story comparison; image fitting does not
  turn it into a pass.
- Panel Playwright: all 38 behavioral tests pass. Eight compare-only panel
  snapshots report the same 392-pixel change around the audited accordion
  action icon; no snapshot was updated.
- Interaction capture follow-up: the complete 291-test unit suite passes; two
  focused panel Playwright regressions prove selected-row request identity,
  exact-call replay, and the shared Story/Diff Chromium contract. Live
  Storybook defaults to the wired interaction only, **Show all** explicitly
  discovers uncaptured calls and reveals the fully resolved
  `expect(<div…>).toBeInTheDocument()` capture point, and a
  Storybook-selected missing interaction reveals its Create action. The
  compare-only capture endpoint reaches the selected call and returns a 3696px
  PNG without writing a baseline.
- Full `pnpm checks` remains blocked before Visual Delta validation by the
  parent Popover story's formatting and one unrelated workspace story-mode
  contract assertion. The changed Visual Delta files pass Prettier individually.
