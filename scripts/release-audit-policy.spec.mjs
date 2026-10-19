import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  AUDIT_EXCEPTION,
  archiveIdentity,
  verifyReleaseAudit,
} from "./release-audit-policy.mjs";

const source = "a".repeat(40);
function report(findings = []) {
  return {
    actions: [],
    muted: [],
    advisories: Object.fromEntries(
      findings.map((finding, index) => [index, finding])
    ),
    metadata: {
      totalDependencies: 741,
      vulnerabilities: Object.fromEntries(
        ["info", "low", "moderate", "high", "critical"].map((severity) => [
          severity,
          findings.filter((finding) => finding.severity === severity).length,
        ])
      ),
    },
  };
}
function candidate() {
  return {
    full: report(
      AUDIT_EXCEPTION.findings.map((finding) => ({
        github_advisory_id: finding.id,
        module_name: finding.name,
        severity: finding.severity,
        patched_versions: "<0.0.0",
        vulnerable_versions: `<=${finding.maximum}`,
        deleted: null,
        url: `https://github.com/advisories/${finding.id}`,
        findings: [{ version: finding.version, paths: [finding.path] }],
      }))
    ),
    production: report(),
    fullStatus: 1,
    productionStatus: 0,
    version: "0.0.8",
    now: Date.parse("2026-10-19T22:00:00Z"),
    approvedSource: source,
    source,
    checkout: source,
    repository: "lapismd/storybook-addon-visual-delta",
    ref: "refs/tags/v0.0.8",
    lock: AUDIT_EXCEPTION.lock,
    artifact: AUDIT_EXCEPTION.artifact,
    payload: AUDIT_EXCEPTION.payload,
    publishedVersions: ["0.0.7"],
    registryVersions: { braces: ["3.0.3"], "sprintf-js": ["1.0.3", "1.1.3"] },
  };
}

test("accepts only the approved bounded development graph", () => {
  assert.deepEqual(verifyReleaseAudit(candidate()), {
    exception: true,
    expires: AUDIT_EXCEPTION.expires,
  });
});
test("clean audits need no exception for future releases", () => {
  assert.deepEqual(
    verifyReleaseAudit({
      full: report(),
      production: report(),
      fullStatus: 0,
      productionStatus: 0,
    }),
    { exception: false }
  );
});

const rejections = {
  "different version": (value) => {
    value.version = "0.0.9";
  },
  "expired at boundary": (value) => {
    value.now = Date.parse(AUDIT_EXCEPTION.expires);
  },
  "invalid time": (value) => {
    value.now = NaN;
  },
  "missing source approval": (value) => {
    delete value.approvedSource;
  },
  "different approved source": (value) => {
    value.source = "b".repeat(40);
  },
  "different checkout": (value) => {
    value.checkout = "b".repeat(40);
  },
  "fork repository": (value) => {
    value.repository = "other/fork";
  },
  "branch instead of tag": (value) => {
    value.ref = "refs/heads/main";
  },
  "different lock": (value) => {
    value.lock = "changed";
  },
  "different tarball": (value) => {
    value.artifact = "changed";
  },
  "different decompressed payload": (value) => {
    value.payload = "changed";
  },
  "release already published": (value) => {
    value.publishedVersions.push("0.0.8");
  },
  "missing registry response": (value) => {
    value.publishedVersions = [];
  },
  "invalid registry version list": (value) => {
    value.registryVersions.braces = {};
  },
  "new upstream release": (value) => {
    value.registryVersions.braces.push("3.0.4");
  },
  "new prerelease": (value) => {
    value.registryVersions.braces.push("3.0.4-rc.1");
  },
  "new advisory fix": (value) => {
    value.full.advisories[0].patched_versions = ">=3.0.4";
  },
  "different package": (value) => {
    value.full.advisories[0].module_name = "other";
  },
  "different advisory": (value) => {
    value.full.advisories[0].github_advisory_id = "GHSA-other";
  },
  "different vulnerable version": (value) => {
    value.full.advisories[0].findings[0].version = "3.0.2";
  },
  "unreviewed path": (value) => {
    value.full.advisories[0].findings[0].paths.push(".>runtime>braces");
  },
  "production finding": (value) => {
    value.production = report([value.full.advisories[0]]);
    value.productionStatus = 1;
  },
  "additional advisory": (value) => {
    value.full = report([
      ...Object.values(value.full.advisories),
      { ...value.full.advisories[0], github_advisory_id: "new" },
    ]);
  },
  "missing finding": (value) => {
    value.full = report([value.full.advisories[0]]);
  },
  "muted finding": (value) => {
    value.full.muted.push("anything");
  },
  "truncated report": (value) => {
    delete value.full.metadata;
  },
  "null advisory report": (value) => {
    value.full.advisories = null;
  },
  "false clean count": (value) => {
    value.full.metadata.vulnerabilities.high = 0;
  },
  "audit process failure": (value) => {
    value.fullStatus = 2;
  },
  "audit failure with clean output": (value) => {
    value.productionStatus = 1;
  },
  "registry error": (value) => {
    value.full.error = { code: "ETIMEDOUT" };
  },
};
for (const [name, mutate] of Object.entries(rejections)) {
  test(`rejects ${name}`, () => {
    const value = candidate();
    mutate(value);
    assert.throws(() => verifyReleaseAudit(value));
  });
}

test("tag gate and publisher retain exact source and audited tarball wiring", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/npm-publish.yml", import.meta.url),
    "utf8"
  );
  assert.equal(
    workflow.match(/node scripts\/check-release-audit\.mjs/g)?.length,
    2
  );
  assert.match(
    workflow,
    /RELEASE_AUDIT_APPROVED_SOURCE: \$\{\{ vars\.VD_008_AUDIT_APPROVED_SOURCE \}\}/
  );
  assert.match(
    workflow,
    /npm publish \.cache\/release-audit\/candidate\.tgz --provenance/
  );
  assert.match(workflow, /path: \.cache\/release-audit\//);
  const release = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );
  assert.match(
    release,
    /RELEASE_AUDIT_APPROVED_SOURCE: \$\{\{ vars\.VD_008_AUDIT_APPROVED_SOURCE \}\}/
  );
});

test("distinguishes gzip bytes while retaining exact tar payload identity", () => {
  const payload = Buffer.from("reviewed tar payload ".repeat(300));
  const first = archiveIdentity(gzipSync(payload, { level: 1 }));
  const second = archiveIdentity(gzipSync(payload, { level: 9 }));
  assert.notEqual(first.artifact, second.artifact);
  assert.equal(first.payload, second.payload);
  assert.notEqual(
    first.payload,
    archiveIdentity(gzipSync(Buffer.from("changed"))).payload
  );
  assert.throws(() => archiveIdentity(Buffer.from("invalid gzip")));
});
