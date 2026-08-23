# Changesets

Every pull request that changes public package runtime source or the package
manifest must include a Changeset. Run `deno task changeset`, select the package when
a version bump is required, and describe the consumer-visible result. Select an
empty Changeset when the change does not require a package release.

The release workflow owns version and changelog updates through the Version
Packages pull request. Do not edit the published version by hand.
