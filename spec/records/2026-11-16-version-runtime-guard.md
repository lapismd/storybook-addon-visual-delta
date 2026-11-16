# Visual Delta qualified Node version authority

VD-GOV-018 retains canonical-main-only repository-scoped App authority and the
existing source-owned Node 24.15.0, pnpm 10.32.1 and Changesets 3.0.3 command:
`changeset version && corepack pnpm@10.32.1 install --lockfile-only`.
The shared guard now checks bound config/workspace/script/package-manager inputs,
installed CLI bytes and actual release intent before either writer. Empty
maintenance notes alone return false, so no App token or version action runs.
The job output comes from that actual plan, without a fallback to the native
Changesets action's empty-note detection. Changed inputs fail before authority.

## Actual whole-recipe proof

Shared source `fe24b7bf909106d957b179f351153505c41fa47c` completed hosted run
`43977922918` successfully for immutable owner source
`1d8056458f19c33ba541c64ab78f1b12adc0aaa2`. Artifact `14281661065` has verified
ZIP digest `sha256:12a2d22c39f379262c59543f194820bb1167fc728be7efd74221e601b53e53b8`.
The exact successful run/source, artifact identity, downloaded digest and receipt
were independently read back before adoption.

The existing fenced fixture restored only the exact historical patch note from
ancestor `48f2f67da74ac6959bc4f59d1095f654a22de9af`; this is explicitly historical
validation input, not current release intent. The unchanged command prepares
only the counterfactual root version 0.1.5 to 0.1.6. It consumes that genuine
note and the reviewed empty maintenance note, preserves historical changelog
entries, leaves lock/config/workspace and all 14 canonical files unchanged,
and rejects unexpected tracked/untracked paths. Stock Node executable and all
nine Corepack 0.34.6 code/package files are SHA-256 checked before and after.
Deno is absent; no writer App, remote branch, tag, signing or publication occurs.

The first hosted attempt `43976382266` completed the command but rejected ten
harness scratch files inside source. Shared CI PR24 moved owned proof metadata
outside the consumer checkout and retained every output assertion. Its source
verification passes 236 tests. The successful receipt above qualifies this
correction; no consumer ignore rule or release command was changed.

The owner's formatter is unconfigured. The opt-in qualification binds absence
of standard Prettier/EditorConfig inputs through lookup ancestry and rejects
new declarations instead of installing or choosing another formatter. The action
is pinned to the successfully qualified shared source. Owner workflow edits,
the new qualification JSON and canonical/test evidence leave the command,
manifest, lock, formatter policy and executable recipe closure unchanged.

## Owner acceptance

Before the workflow change, the exact source-qualified-intent regression fails
once because the guard is absent. It now passes, and all four release-workflow
contracts pass. Final package/specification/actionlint checks and current-head
CI remain required before merge. Actual merged-main false/no-App behavior remains
a separate deployment gate. This maintenance slice creates no package release;
explicit tag, full/production audit, signing, publication and baseline approval
remain unchanged.

Local owner acceptance completes `pnpm check`: 619 package tests, all seven
specification lanes, both TypeScript targets, executable Node build and publint
pass. All 164 Node release-control tests pass, including four workflow contracts.
The original full main-range spec-first check passes one protected file and two
canonical chapters. Actionlint passes. Actual current-source planning accepts
CLI 3.0.3 and returns `hasChangesets: false` for the empty maintenance note,
without source mutation or writer authority. The existing publint repository-URL
suggestion and intentional doctor alias warning remain visible.
