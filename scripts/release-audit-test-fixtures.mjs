import { AUDIT_EXCEPTION } from "./release-audit-policy.mjs";

const source = "a".repeat(40);
export function report(findings = []) {
  return {
    actions: [],
    muted: [],
    advisories: Object.fromEntries(
      findings.map((finding, index) => [index, finding]),
    ),
    metadata: {
      totalDependencies: 741,
      vulnerabilities: Object.fromEntries(
        ["info", "low", "moderate", "high", "critical"].map((severity) => [
          severity,
          findings.filter((finding) => finding.severity === severity).length,
        ]),
      ),
    },
  };
}
export function candidate() {
  return {
    full: report(
      AUDIT_EXCEPTION.findings.map((finding) => ({
        github_advisory_id: finding.id,
        module_name: finding.name,
        severity: finding.severity,
        patched_versions: "<0.0.0",
        vulnerable_versions: finding.vulnerable,
        deleted: null,
        url: `https://github.com/advisories/${finding.id}`,
        findings: [{ version: finding.version, paths: [finding.path] }],
      })),
    ),
    production: report(),
    fullStatus: 1,
    productionStatus: 0,
    version: "0.1.5",
    now: Date.parse("2026-11-14T08:00:00Z"),
    approvedSource: source,
    source,
    checkout: source,
    repository: "lapismd/storybook-addon-visual-delta",
    ref: "refs/tags/v0.1.5",
    lock: AUDIT_EXCEPTION.lock,
    artifact: AUDIT_EXCEPTION.artifact,
    payload: AUDIT_EXCEPTION.payload,
    publishedVersions: ["0.1.4"],
    registryVersions: { deepmerge: ["4.2.0", "4.3.1"] },
  };
}
