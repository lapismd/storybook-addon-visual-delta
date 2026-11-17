# Shared specification-tool dependency adoption

VD-GOV-019/020/021 qualify the existing development-only validator0.2.1, one
exact workspace override and the independent normal package guard. The public
runtime dependencies, peers, exports, version0.1.5 and baseline bytes remain
unchanged. The new Changeset is empty; actual guarded release intent is false.
Direct YAML parsing uses the already-resolved registry yaml2.9.1 through an
explicit development dependency, without a transitive import or local alias.

The actual released validator0.2.0→0.2.1 pair is regenerated using pnpm10.32.1
and accepted by both coordinator and independent guards. Source stays0.2.1;
no future release or downgrade is fabricated. The14 focused cases pass,
including stale/missing/duplicate facts, manual text, policy, scope, public
contract, integrity, unrelated edge and Git/JJ reader negatives. Hosted Git
checkouts retain complete read-only ancestry; local Jujutsu remains supported.

The exact CI, PR-specification, Pages and version workflow identities are
registered in coordinator74. The completion implementation/policy both pin
92e3e55d174498916c134f950850e1d572656cab, with only the existing explicit App
secret. Candidate code, caches, artifacts, self-triggers and inherited secrets
remain excluded. Existing verified npm notification/tag/manual-native gates
remain unchanged. Storybook11 issue19 is a separate major migration.

The shared pre-merge/version guard initially rejected a workspace-only bound
recipe because its extra-file map was empty. The source-owned Lapis CI fix29
admits only this exact Changesets/corepack-pnpm command with a real workspace
policy; arbitrary helpers, direct mode and missing bindings still fail. Its
exact regression fails once before repair;302 full source tests pass. Actual
installed Visual Delta inputs then pass with release intent=false. A genuine
new-version publication branch is not exercised by this maintenance slice.

Normal source validation passes619 unit tests,178 script cases, all8 canonical
lanes, architecture, types, build and publint. The initial31-case workflow/image
boundary had two failures, then one manager-mutation fixture failure: explicit
reviewed action pins, package-history contract and a manager-scoped negative
fixture repair resolve them without weaker assertions; final31/31 pass.
QMD configuration, doctor and actual system QMD search pass. Hosted compare-only
panel/manager/multi-browser gates remain required; no baseline is approved.

Fresh full audit remains one HIGH GHSA-fc5q-39xc-vjpf on the Changesets path;
production audit is clean. Historical release LOW and exact coordinator HIGH
approvals are not transferred, renewed or widened. This source remains a held
draft pending its current hosted/security/source acceptance and final merge pass.
Standing operator approval covers per-repository activation after passing merge
and acceptance, followed by ordinary no-update settlement/replay; none is claimed
from source registration or local tests alone.

Formatting the manager-history negative exposed three counted-line growth
findings in its existing test file. The owned test is extracted into
`ci-checkout-history.spec.mjs` and the old budget decreases442→423; no size
threshold or assertion is weakened. Final31 focused boundary cases,178 script
cases and all8 canonical lanes pass with the exact new CI guard pin.
