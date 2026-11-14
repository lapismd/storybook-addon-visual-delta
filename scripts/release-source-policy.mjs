import { AUDIT_EXCEPTION } from "./release-audit-policy.mjs";

export function validateReleaseCandidate(context) {
  if (
    context.event !== "workflow_dispatch" ||
    context.ref !== "refs/heads/main" ||
    context.repository !== "lapismd/storybook-addon-visual-delta"
  ) {
    throw new Error("Release qualification requires canonical main dispatch");
  }
  if (!/^[a-f0-9]{40}$/.test(context.source || "")) {
    throw new Error(
      "Release qualification requires an exact 40-character source SHA",
    );
  }
  if (context.head !== context.source) {
    throw new Error("Checked-out source differs from the requested source");
  }
  if (!context.versionPackagesCommit || context.pendingChangesets.length) {
    throw new Error("Source must be a completed Version Packages commit");
  }
}

export function validateReleaseApproval(context) {
  validateReleaseCandidate(context);
  if (context.approved !== "true") {
    throw new Error("Release tags require explicit approval on canonical main");
  }
  if (
    context.version === AUDIT_EXCEPTION.version &&
    context.auditApprovedSource !== context.source
  ) {
    throw new Error(
      `${AUDIT_EXCEPTION.version} requires its exact reviewed audit-exception source`,
    );
  }
}
