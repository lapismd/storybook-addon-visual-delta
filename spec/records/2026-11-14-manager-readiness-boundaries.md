# Manager readiness boundaries

Hosted ARM64 workflow 43564185074 (head 92ad5bf85774) retained actual traces
and DOM contexts after failure: 51 passed, four failed and one existing skip.
Three failures timed out in shared `openManager` navigation waiting for
`networkidle`, while their snapshots already showed the rendered manager.
The trace retains normal runtime polling during that wait. The fourth failure
asserted the provisional Loading status after its six-second story play had
already completed; the completed-story message is present in the snapshot.
The earlier mode-choice timeout did not recur in this run.

A focused regression keeps one unrelated HTTP request pending during manager
navigation. The original helper fails that exact test once at its existing
60-second timeout. Navigation now waits for DOMContentLoaded and retains the
existing visible tab/panel assertions. Each behavior test retains its own
specific readiness and interaction assertions.

The missing-baseline fixture now completes its real play lifecycle only when
the explicit Finish delayed play button is clicked. The browser test asserts
Loading, absence of Create, and absence of Baseline missing before clicking;
it then retains the completed missing-baseline and enabled Create assertions.
No assertion, timeout, retry, skip or visual threshold is loosened.

The helper serves all manager/captured-actual/sidebar/overlay families. Exact
regressions must pass before the complete cold manager suite, fresh static
Storybook, panel, three-browser, package, specification and native lanes are
qualified. This evidence does not independently prove an earlier mode-popover
race fixed. Committed visual baselines remain untouched.

Early focused runs passed the navigation and other repaired targets but exposed
the old readiness locator's assumption that only one Create Default control
exists. The real panel has header and section actions. The test now requires
exactly two controls and asserts both visible and enabled, preserving the
provisional zero-control assertions. The readiness case moves to its own small
manager test module, and its gated fixture moves into an owning component.
Recorded line budgets for the extracted files decrease; no budget is raised.

The first full local escalation passed 53 cases with three failures and one
existing skip. It exposed additional harness assumptions: ordinary controls
were exercised before the exact story/panel state finished initializing, and
geometry was read before its existing ready marker. The extracted navigation
helper now waits for exact story completion and resolved panel state by default,
with an explicit provisional option for the gated readiness case. Inline
manager navigation uses the same completion precondition. Geometry retains all
numeric bounds and waits for the authoritative ready marker before reading.
Completed-state story tests retain their original story-specific Create assertions.
All eleven focused regressions and directly affected desktop/mobile navigation
cases then pass in a fresh server run. Source behavior is unchanged.

After the semantic completion precondition, full manager escalation passes 55
cases with one existing skip and one incorrect new control-count assertion.
That assertion had accidentally applied the readiness fixture's two-control
shape to the deleted-baseline story. Its original singular visible-control
assertion is restored. The gated readiness fixture still asserts both of its
own existing Create controls; other completed-state assertions are unchanged.

## Final local qualification

- Focused pending-network regression: one failure before, passing afterward.
- All twelve focused/directly affected desktop/mobile/geometry cases pass.
- Complete cold manager lane: 56 pass, one unchanged existing skip, zero failures.
- Cold panel lane: all 13 pass, including a fresh static Storybook build.
- All seven Chromium/Firefox/WebKit and failure-policy scenarios pass.
- Native capture, persistent fixture, comparison and reuse acceptance pass.
- Pinned typechecks, all 619 units, all seven specification lanes, Node build
  and publint pass. Spec validator remains the latest Deno-free 0.2.0 release.
- Recorded counted lines decrease: readiness story 35 to 33, shared support
  380 to 346, and the extracted main manager test 1,891 to 1,871. New modules
  remain below their existing architecture limits. No committed PNG changed.

Logs are retained as `vd74-readiness-twelve-after`,
`vd74-readiness-verified-check` and `vd74-readiness-verified-browser` in the
private task evidence directory. Hosted native ARM64 qualification remains
required on the resulting source commit before merge. The unfixed development
audit finding and its separate release-approval boundary remain unchanged.
