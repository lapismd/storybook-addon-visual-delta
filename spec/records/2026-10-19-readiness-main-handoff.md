# Navigation readiness landing

2026-10-19; enclosing Jujutsu change.

The user requested landing the footer work and removing this session's temporary
workspaces. Duplicate the qualified readiness fix `011ed6aa19da43a796a4e1e70edf55eab00164c9`
onto the clean default checkout, preserving its independent architecture and CI
work. The landed patch is `9e56a7e3`; original evidence and patch Changeset remain.
VD-CAP-002 is unchanged: an absent document root remains unready, and exact story
identity and the existing deadline are retained. No capture or baseline policy
changes.

- `pnpm exec vitest run src/playwright/readiness.spec.ts`: 3 tests pass.
- `pnpm check`: types, 551 tests in 116 files, six specification lanes, Node
  build and publint pass. The existing repository-URL suggestion is informational.
- Logs: `.local/verification/footer/readiness-exact.log` and `check.log`.

The original v0.0.7-based validation archive remains the qualified Design Core
dependency; preserve its bytes in the main Core workspace before removing the
temporary checkout. This landing does not publish that archive or the package.

Milestone review: readiness regression and main-source landing pass. Existing
capture/browser gaps and visual approval remain under their original gates.
