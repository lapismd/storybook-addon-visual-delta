# Visual Delta workflow and VCS plan

> Historical implementation record. Use the
> [`Visual Delta system specification`](./specs/index.md) for the normative
> contract.

## Action matrix

| Action                                          | Auto-approve eligible           | Change tracking                      | Commit policy       |
| ----------------------------------------------- | ------------------------------- | ------------------------------------ | ------------------- |
| Diff HTML                                       | No                              | No                                   | Never               |
| Diff Chromium                                   | Passing exact-story result only | Review-tag mutation only             | Configured workflow |
| Story visual run                                | Passing exact-story result only | Review-tag mutation only             | Configured workflow |
| Component/global/affected run                   | No                              | Status-tag mutation when enabled     | Configured workflow |
| Create/update/delete baseline                   | No                              | Baseline, sidecar, and CSF mutations | Configured workflow |
| Create/update interaction baseline              | No                              | Baseline and CSF mutations           | Configured workflow |
| Accept/Unaccept/Ready/Failed                    | No                              | Exact requested review tags          | Configured workflow |
| Skip/include and story configuration            | No                              | Exact story source                   | Configured workflow |
| Project configuration and initialization        | No                              | Exact generated/configuration files  | Manual review       |
| History, capture, affected plan, static rebuild | No                              | No                                   | Never               |

## Safety rules

- Auto-approval is opt-in and applies only to fresh authoritative single-story
  Chromium outcomes classified as `passed` or `changed-within-tolerance`.
- VCS commits require both project workflow opt-in and the host
  `allowVcsWrites` capability.
- Commits contain one complete Visual Delta change set. They never push,
  amend, squash, branch, or select only part of an interdependent operation.
- Paths dirty before Visual Delta touched them, paths changed after capture,
  unexpected paths, and partial/failed operations block a plugin-managed
  commit.
- Unrelated dirty paths remain outside the change set and do not block safe
  commits.
- Git and Jujutsu commands use argument arrays without a shell.
- Validation never updates committed visual baselines.

## Implementation checklist

- [x] Extend project and resolved configuration with workflow settings.
- [x] Add the host VCS-write capability and diagnostics.
- [x] Auto-approve passing authoritative live story comparisons.
- [x] Introduce centralized mutation/change-set tracking.
- [x] Add Git and Jujutsu exact-path commit adapters.
- [x] Cover every UI-driven mutation endpoint and exclude read-only actions.
- [x] Add change-set list, diff, image, and commit endpoints.
- [x] Add the Configuration Workflow tab.
- [x] Add the Changes screen, badge, review navigation, and auto-commit result.
- [x] Add unit, middleware, component, and browser coverage.
- [x] Update README and VENDOR documentation.

## Validation evidence

- `pnpm exec vitest run --project visual-delta`: 78 files and 315 tests
  passed, including real temporary Git and Jujutsu exact-path commit fixtures.
- `pnpm --filter storybook-addon-visual-delta typecheck`, `pnpm check`,
  `pnpm check:visual-delta`, `pnpm check:docs-mcp`, and
  `pnpm check:no-tailwind`: passed with zero Svelte diagnostics.
- Focused Storybook accordion interaction tests: 2 passed after making the
  heading query unambiguous with the existing baseline kebab action.
- Live Storybook browser acceptance at `:9009`: Changes is reachable from the
  Visual Delta kebab; Workflow renders legacy-off defaults, editable policy,
  JJ detection, template preview, and the disabled host-gate diagnostic.
- `pnpm test:workspace:pointer` (7 tests), `pnpm test:shell:pointer` (4 tests),
  `pnpm test:ai-chat-browser` (2 tests), and `pnpm build-storybook`: passed.
- `pnpm test:storybook`: 503 passed; one existing AppShell select teardown
  assertion failed outside Visual Delta. Both Visual Delta story regressions
  that initially had ambiguous accordion queries pass after the focused fix.
- `pnpm test:visual-delta-panel`: all 38 behavioral cases passed; 8 existing
  screenshots remain stale after the earlier accordion action controls were
  added. No screenshots were updated.
- `pnpm test:visual`: 312 passed and 49 existing missing/stale baseline or
  interaction-capture cases failed. Both Popover stories pass. No snapshots
  were updated.
- `pnpm checks`: stops at three pre-existing formatting failures in the
  AlertDialog and Popover story files. The changed-file Prettier check passes.
- `pnpm test:unit`: 729 passed; the existing workspace story-mode contract
  assertion remains stale. `pnpm workspace:visual:audit` reports the existing
  71 workspace stories without review tags.
