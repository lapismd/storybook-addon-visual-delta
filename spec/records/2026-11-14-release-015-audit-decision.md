# Approved 0.1.5 development-only audit decision

The user explicitly approved the exact Visual Delta exception on November 14,
separately from Community: only LOW GHSA-gcqx-w48m-w2h4 in deepmerge 4.3.1 on
`.>@sveltejs/vite-plugin-svelte>deepmerge`, for 0.1.5, expiring November 21.
The reviewed candidate's full audit has exactly that one LOW; production has
zero findings. The earlier two MODERATE findings were fixed in the coupled
tooling source change and receive no exception.

The existing expired 0.0.8 policy rejected this candidate. The replacement is
bound to the reviewed lock, compressed archive, complete inflated payload,
final exact Version Packages source, canonical repository and exact tag.
It ends on expiry, publication or an available deepmerge fix. All other
findings and all source/package/browser/provenance/consumer gates remain active.

The policy tests retain negative cases for missing or changed source approval,
wrong checkout/repository/ref, expired approval, changed bytes, already-published
versions, registry errors, new stable/prerelease upstream versions, patched
advisories, altered paths, production findings, additional findings, malformed
reports and mismatched process/count outcomes. Additional MODERATE findings,
changed severity/range and replayed old exception identities explicitly reject.
Pre-tag candidate qualification binds the requested source and intended exact
tag without creating a tag or invoking publication.

The real Linux Node 24.15.0 / pnpm 10.32.1 pack of the reviewed 0.1.5
candidate is byte-identical to the approved archive: SHA256
`4055f4f64705d3001422d93a3ba69772e5037f15d3c8fe2ac4e41e88704070b6`;
inflated tar SHA256
`408b3e72da1db8c7aa6be44641a9382e9fee1a785b20ba6f5bb6964a44292234`.
No gzip-only or package-content allowance was needed.

The first wider check found three counted-line growth violations. Rather than
raise budgets, source approval policy, workflow acceptance and audit fixtures
were extracted into dedicated modules. Existing budgets decrease:
`check-release-source.mjs` 92 to 64, its test 150 to 99, and audit-policy tests
221 to 193. All existing assertions remain collected; new modules stay within
the normal limits. These repository-only files are outside the npm payload.

The extracted workflow test file is explicitly registered in the canonical
repository-script test lane; moving tests does not remove them from ordinary
CI. Focused audit/source/workflow/architecture acceptance passes all 69 cases.
The complete pinned Node 24.15 package check passes 619 unit cases, types, build,
package lint and all seven specification lanes. The updated full script lane
also includes both extracted workflow cases. Workflow linting passes.
The real current reports are one LOW, zero MODERATE and zero production findings;
the policy predicate accepts exactly that reviewed archive and report pair.
The final merged-source checkout remains separately qualified before tag creation.

Final pinned Node 24.15 / pnpm 10.32.1 verification passes all 619 package
unit cases, all 162 explicitly registered repository-script cases, and seven
specification lanes, plus types, build and package lint. The current public
capture-image `latest` digest is independently verified as the qualified
`sha256:07accec7a558224cf39ab8ea0d8e65cbee53837be1122cc9d6420cb12d637161`.
