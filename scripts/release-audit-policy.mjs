export const AUDIT_EXCEPTION = Object.freeze({
  version: "0.0.8",
  expires: "2026-11-02T00:00:00.000Z",
  lock: "7aef952f349b6fcc06b924d521d27cf9a6df1728d3d84c1e317032b99166d189",
  artifact: "f445b1d12ebd1241360d210eca324cfd2bcb9df4c1517bb2abb6504280279182",
  findings: [
    {
      id: "GHSA-vfj7-8cjw-p6xm",
      name: "braces",
      version: "3.0.3",
      maximum: "3.0.3",
      severity: "high",
      path: ".>@changesets/cli>@changesets/config>micromatch>braces",
    },
    {
      id: "GHSA-hp3w-g68c-fv3c",
      name: "sprintf-js",
      version: "1.0.3",
      maximum: "1.1.3",
      severity: "moderate",
      path: ".>@changesets/cli>@manypkg/get-packages>read-yaml-file>js-yaml>argparse>sprintf-js",
    },
  ],
});

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function auditFindings(report, status) {
  requireValue(
    report &&
      typeof report.advisories === "object" &&
      report.advisories !== null &&
      !Array.isArray(report.advisories) &&
      Array.isArray(report.actions) &&
      report.actions.length === 0 &&
      Array.isArray(report.muted) &&
      report.muted.length === 0 &&
      !report.error,
    "Incomplete audit report, muted findings or registry error"
  );
  const counts = report.metadata?.vulnerabilities;
  requireValue(
    counts &&
      ["info", "low", "moderate", "high", "critical"].every(
        (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0
      ) &&
      Number.isSafeInteger(report.metadata.totalDependencies) &&
      report.metadata.totalDependencies > 0,
    "Incomplete audit metadata"
  );
  const findings = Object.values(report.advisories);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  requireValue(
    total === findings.length && status === (findings.length ? 1 : 0),
    "Audit outcome does not match its complete findings"
  );
  for (const severity of Object.keys(counts)) {
    requireValue(
      findings.filter((finding) => finding?.severity === severity).length ===
        counts[severity],
      "Audit severity counts differ from findings"
    );
  }
  return findings;
}

function noNewRelease(versions, maximum) {
  requireValue(
    Array.isArray(versions) && versions.includes(maximum),
    "Missing registry versions"
  );
  const limit = maximum.split(".").map(Number);
  for (const version of versions) {
    requireValue(
      typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version),
      "Unreviewed registry version"
    );
    const parts = version.split(".").map(Number);
    const firstDifference = parts.findIndex(
      (part, index) => part !== limit[index]
    );
    requireValue(
      firstDifference < 0 || parts[firstDifference] < limit[firstDifference],
      "An upstream release may provide a fix; re-review required"
    );
  }
}

export function verifyReleaseAudit(context) {
  const production = auditFindings(
    context.production,
    context.productionStatus
  );
  requireValue(production.length === 0, "Production audit must be clean");
  const findings = auditFindings(context.full, context.fullStatus);
  if (!findings.length) return { exception: false };
  const policy = AUDIT_EXCEPTION;
  requireValue(
    context.version === policy.version,
    "Exception is only for 0.0.8"
  );
  requireValue(
    Number.isFinite(context.now) && context.now < Date.parse(policy.expires),
    "Audit exception expired"
  );
  requireValue(
    /^[a-f0-9]{40}$/.test(context.approvedSource ?? "") &&
      context.source === context.approvedSource &&
      context.checkout === context.source &&
      context.repository === "lapismd/storybook-addon-visual-delta" &&
      context.ref === "refs/tags/v0.0.8",
    "Audit exception requires the exact reviewed release source and tag"
  );
  requireValue(
    context.lock === policy.lock && context.artifact === policy.artifact,
    "Reviewed lock or artifact differs"
  );
  requireValue(
    Array.isArray(context.publishedVersions) &&
      context.publishedVersions.length > 0 &&
      context.publishedVersions.every((value) => typeof value === "string") &&
      !context.publishedVersions.includes(policy.version),
    "Exception ends when 0.0.8 is published; invalid registry response also rejects"
  );
  requireValue(
    findings.length === policy.findings.length,
    "Unexpected audit findings"
  );
  for (const expected of policy.findings) {
    const actual = findings.find(
      (finding) => finding?.github_advisory_id === expected.id
    );
    requireValue(
      actual?.module_name === expected.name &&
        actual.severity === expected.severity &&
        actual.patched_versions === "<0.0.0" &&
        actual.url === `https://github.com/advisories/${expected.id}` &&
        actual.vulnerable_versions === `<=${expected.maximum}` &&
        actual.deleted === null &&
        Array.isArray(actual.findings) &&
        actual.findings.length === 1 &&
        actual.findings[0].version === expected.version &&
        JSON.stringify(actual.findings[0].paths) ===
          JSON.stringify([expected.path]),
      `Unapproved finding or available fix: ${expected.id}`
    );
    noNewRelease(context.registryVersions?.[expected.name], expected.maximum);
  }
  return { exception: true, expires: policy.expires };
}
