# Visual Delta mutations and review

This reference defines every state-changing action, its authorization, exact target, side effects, invalidation rules, and review semantics. Compare-only behavior is outside this mutation boundary and never writes baselines.

## Normative requirements

These requirements make every durable change explicit, scoped, and reviewable.

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VD-MUT-001 | Creating, overwriting, deleting, or migrating a baseline MUST require an explicit action, exact story/variant/browser target, canonical capture profile, and write approval. Inherited process state alone MUST NOT authorize an interactive write. A panel mutation MUST target an enabled browser and MUST stage capture-runner output before the host applies its exact approved change set. |
| VD-MUT-002 | Every mutation MUST declare exact story IDs and expected file paths or safe prefixes before it starts. Empty targets, traversal, target mismatch, and unexpected changed paths MUST fail closed. A host baseline mutation MUST pass its resolved snapshot directory and baseline path mode to the capture worker unless its configured writer command explicitly overrides those options. A create-only primary writer MUST capture only targets whose requested browser baseline is missing; existing targets MAY be wired but MUST NOT trigger a static build or browser launch. When Playwright signals that a requested primary snapshot did not previously exist, the writer MUST report success only after every requested missing target exists and an updates-disabled replay passes. A create-only interaction writer MUST NOT overwrite or recapture an existing target and MUST apply the same write-then-verify contract before reporting success. |
| VD-MUT-003 | A successful baseline write MUST invalidate prior comparison evidence for written stories and set only those stories to pending review. The coordinated filename migration MUST remove legacy and canonical derived sidecars and invalidate the selected affected-test cache so browser-only paths cannot reuse platform-qualified passing evidence. It MUST NOT change unrelated stories or preserve stale approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VD-MUT-004 | Deletion MUST remove one verified baseline, its derived sidecars, and only its matching story wiring. It MUST reject a baseline that does not belong to the requested story.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| VD-MUT-005 | Review status, skip eligibility, coverage, and comparison outcome MUST remain independent. Review actions MUST mutate only review tags and MUST leave exactly one effective review status after Storybook resolves project, component, and story tag inheritance. A story-level status write MUST replace stale positive and negated review directives, write the requested positive tag, and negate every non-selected review tag so inherited siblings cannot remain effective. Clearing a story-level review status MUST negate every review tag. A multi-story review request MUST resolve and validate every requested story before applying source changes, group mutations by story source, and write each touched source file at most once so the live Storybook index and Vite importer cannot observe a partially rewritten per-story batch. Comparison actions MUST NOT imply review changes without explicit opt-in. Accept current run MUST approve only last-run stories whose outcome is passed or changed within tolerance. Unaccept current run MUST stamp `visual-failed` only for last-run mismatches and MUST NOT alter passed stories. Story and component Accept/Unaccept scopes remain approve-all / pending-all for their exact targets. Result-to-review Update status MUST NOT downgrade `visual-approved` to `visual-ready` when the outcome is passed or changed within tolerance; it MAY stamp `visual-failed` for mismatches even when previously approved. Testing Module **Run Diff** MAY Accept last-run passes only when `workflow.autoAcceptLiveStoryComparisons` is enabled; ordinary **Run visual tests** MUST NOT Accept. |
| VD-MUT-006 | Project configuration, story configuration, skip or include, initialization, and static rebuild MUST each apply only their documented side effects and MUST report exact changed files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| VD-MUT-007 | Doctor repair MUST require explicit `--fix`, preflight traversal-safe destinations, and never create, replace, rename, or delete a baseline, story source, or durable configuration file. A valid misplaced version 4 result trio MAY move to its canonical mirrored artifact path. Obsolete, incomplete, or legacy companions MAY move to a run-specific quarantine beneath `.visual-delta/cache` with an original-path, reason, and checksum manifest. Legacy cache state MAY move to its canonical cache location only when that destination is absent. A repair MUST copy and checksum before removing a source, MUST NOT overwrite or merge a collision, and MUST rescan and report applied, skipped, and remaining findings. |

## Mutation matrix

The matrix limits each action to its named state effects.

| Action                | Required target                              | Durable effects                                       | Evidence effects                          | Review effects                  |
| --------------------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| Create baseline       | Frozen story IDs, create-only mode, approval | New requested PNGs and story wiring                   | Invalidate affected sidecars              | Written stories become pending  |
| Update baseline       | Frozen story IDs, overwrite mode, approval   | Requested PNGs and wiring                             | Invalidate affected sidecars              | Written stories become pending  |
| Create interaction    | Story ID, interaction ID and label, approval | One interaction PNG and `{ id, label, src }` wiring   | Invalidate that story’s result evidence   | Story becomes pending           |
| Delete baseline       | Story ID and verified baseline URL           | One PNG, matching wiring, derived sidecars            | Remove deleted target evidence            | Does not approve another target |
| Set review status     | Exact story IDs and one status               | One effective review tag plus inherited-tag exclusions | None                                      | Requested status only           |
| Skip visual           | Exact story or component                     | Add `skip-visual`, remove visual review tags          | Eligibility changes invalidate result use | Review status clears            |
| Include visual        | Exact story or component                     | Remove `skip-visual`                                  | Coverage becomes independently resolvable | No implicit approval            |
| Story configuration   | One story and allow-listed keys              | Update or remove story overrides                      | Invalidate that story’s evidence          | No implicit approval            |
| Project configuration | Valid project defaults or workflow           | Update `.visual-delta/config.json`                    | Invalidate affected evidence              | No implicit approval            |
| Playwright threshold  | Valid percentage                             | Update legacy threshold file                          | Invalidate threshold-dependent evidence   | No implicit approval            |
| Initialize            | Missing scaffold files, or `--force`         | Suite, Playwright config, snapshot directory, scripts | None                                      | None                            |
| Rebuild static        | Host allows rebuild                          | Replace static Storybook output                       | Refresh graph and index                   | None                            |
| Doctor repair         | Explicit `--fix` and classified derived paths | Move valid diagnostics or quarantine obsolete caches | Rescan diagnostics; no baseline evidence  | None                            |

## Write authorization

Baseline writers require both:

- An explicit interactive action or exact command target
- `VISUAL_UPDATE_APPROVED=1` or the equivalent approved writer flag

Playwright writes require `PLAYWRIGHT_UPDATE_SNAPSHOTS=1`. Approved create-only writers also set `PLAYWRIGHT_UPDATE_MODE=missing`; overwrite writers use all requested targets.

The middleware MUST set approval variables for the child it owns instead of trusting unrelated ambient values. Compare commands MUST replace update variables with safe values.

## Exact target validation

Before a mutation starts, middleware freezes story IDs and resolves expected paths. Snapshot paths must remain inside the configured snapshot root.
The same resolved snapshot root and baseline path mode must be forwarded to the
capture worker. Otherwise an existing nested baseline can be misclassified as a
missing flat baseline and a create-only run can broaden into an unintended
catalog capture.

Deletion additionally verifies:

- The URL starts with `/visual-baselines/`
- The decoded relative path has no traversal
- The path matches the requested story’s primary or variant filename family
- The file exists before source wiring changes

A partial failure MUST report completed and failed targets. It MUST not claim success for the full scope.

Playwright can write requested missing snapshots and still exit non-zero to
signal that the expectations did not previously exist. A create-only writer MAY
treat that exit as provisional only when every exact target was absent before
the run and exists afterward. A primary writer MUST replay the same frozen
story set and browser with snapshot updates disabled. An interaction writer
MUST replay the same story, interaction ID, and capture call with snapshot
updates disabled. Only a passing verification replay may continue to source
wiring and successful mutation completion. A missing target or failed
verification remains a partial failure and MUST preserve its diagnostic
change-set evidence.

## Evidence invalidation

Baseline and capture configuration changes invalidate matching `.result.json`, `.actual.png`, and `.diff.png` evidence beneath `.visual-delta/artifacts`. The implementation MAY delete derived evidence or mark it stale, but the panel MUST stop treating it as current.

Baseline creation and overwrite set only written stories to pending. Stories requested but not written retain their existing review status. Updating story configuration does not rewrite a baseline and does not automatically change review status.

## Review semantics

Visual review tags are mutually exclusive:

| Status   | Tag               | Meaning                                                      |
| -------- | ----------------- | ------------------------------------------------------------ |
| Pending  | `visual-pending`  | Baseline exists and awaits review                            |
| Ready    | `visual-ready`    | An agent or developer requests human review                  |
| Approved | `visual-approved` | A human or explicitly allowed workflow accepted the baseline |
| Failed   | `visual-failed`   | Review rejected the baseline                                 |

Story-level source writes enforce this after inheritance, not only within the
local `tags` array. They write the selected positive review tag together with
Storybook negated-tag directives for the three non-selected statuses. A clear
review action writes negated directives for all four statuses. This preserves
component or project defaults for other stories while ensuring the selected
story cannot expose both an inherited status and its own status.

A multi-story review request stages every mutation in memory by source path,
then performs at most one physical write for each touched CSF file after every
story in the request validates. Stories that share a CSF file therefore update
together, avoiding transient per-story file states and repeated Storybook HMR
invalidations. Static index review metadata is synchronized only for the
successfully staged request.

Review status does not determine Playwright expectations. `visual-failed` still compares against its baseline, and `visual-approved` can have a fresh mismatch.

Result-to-review Update status (Testing Module) maps pass / within-tolerance → `visual-ready` and mismatch → `visual-failed`, except it MUST leave an existing `visual-approved` tag unchanged when the outcome still passes or is within tolerance. A fresh mismatch MAY clear approval by stamping `visual-failed`.

Auto-accept MAY set approved only after a fresh authoritative outcome of `passed` or `changed-within-tolerance` from Diff Browser / Story, or from Testing Module **Run Diff** last-run passes. It requires project opt-in (`workflow.autoAcceptLiveStoryComparisons`) and remains separate from baseline writes and Update status. When more than one browser is configured, auto-accept requires a complete clean result for every configured browser; a single-browser live pass MUST NOT approve the story.

Panel Accept / Unaccept scopes:

| Scope       | Accept                                                                                   | Unaccept                                                                      |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Story       | Active story → `visual-approved`                                                         | Active story → `visual-pending`                                               |
| Component   | Every story under the component → `visual-approved`                                      | Every story under the component → `visual-pending`                            |
| Current run | Last-run stories with outcome `passed` or `changed-within-tolerance` → `visual-approved` | Last-run stories with outcome `mismatch` → `visual-failed` (passes unchanged) |

Missing baselines, skips, and infrastructure failures are never included in Current run Accept or Unaccept scopes.

## Configuration and source writes

Story configuration accepts only documented `parameters.visualDelta` override keys. Removing an override restores project or built-in precedence.

Project configuration validates all editable values before atomic persistence. Changes to automation policy always require review and cannot auto-commit themselves.

Skip and include operate on exact story or component source matches. Static index tags MAY update after a source patch so a valid reused static build reflects current eligibility.

Related contracts: [Configuration](./configuration.md), [Baseline model](./baseline-model.md), [VCS and history](./vcs-and-history.md), and [Verification](./verification.md).
