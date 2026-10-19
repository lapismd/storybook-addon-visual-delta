# Navigation readiness regression — 2026-10-19

The Design Core workspace-pointer lane exposed a navigation interval where
`document.documentElement` is absent. The public exact-story completion helper
threw instead of continuing to wait. Under VD-CAP-002 the absent root now returns
false; a previous story's marker also remains false. Only the requested marker
completes the wait, with the existing configured timeout preserved.

This isolated Jujutsu change starts at published v0.0.7 (5e13ad9c), keeping
unrelated unreleased addon work outside the temporary consumer archive.

## Verification

- `pnpm exec vitest run src/playwright/readiness.spec.ts`: before, one failed
  and two passed; after, all three pass. Logs `/tmp/footer-vd-before.log` and
  `/tmp/footer-vd-after.log`.
- `pnpm install --frozen-lockfile --ignore-scripts`: passes with this workspace's
  own dependencies. pnpm 12.6.0, Vitest 4.1.10, TypeScript 7.0.2, Node 26.9.0.
- First `pnpm check`: both type lanes and 551 tests pass; specification script
  tests require built dist and fail before it exists. `pnpm build:node` followed
  by `pnpm spec:check` passes all five lanes.
- Final `pnpm check`: passes both type lanes, 116 files / 551 tests, all five
  specification lanes, executable Node build and publint. Only the existing
  repository URL suggestion remains. `/tmp/footer-vd-check-final.log`.
- `pnpm release:intent`: passes for one public runtime change and one patch
  Changeset. No version edit or publication.

No timeout, story identity, geometry check, visual threshold or baseline is
changed. Consumer pointer qualification is recorded in Design Core's footer
record after installing a checksummed built archive. The enclosing Jujutsu
change owns this evidence; this helper slice is verified independently of
the consumer's remaining browser gates.
