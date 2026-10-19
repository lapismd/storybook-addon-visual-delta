#!/usr/bin/env node
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  AUDIT_EXCEPTION,
  archiveIdentity,
  verifyReleaseAudit,
} from "./release-audit-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".cache/release-audit");
mkdirSync(output, { recursive: true });
writeFileSync(
  path.join(output, "receipt.json"),
  JSON.stringify({ state: "checking" })
);
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

function command(program, args) {
  return execFileSync(program, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  });
}

function audit(name, args) {
  const result = spawnSync(
    "corepack",
    ["pnpm@10.32.1", "audit", "--json", ...args],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120000,
    }
  );
  writeFileSync(path.join(output, `${name}.json`), result.stdout ?? "");
  writeFileSync(path.join(output, `${name}.stderr`), result.stderr ?? "");
  if (result.error || result.signal)
    throw result.error ?? new Error(`Audit signal: ${result.signal}`);
  return { report: JSON.parse(result.stdout), status: result.status };
}

try {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8")
  );
  const full = audit("full", []);
  const production = audit("production", ["--prod"]);
  const tarball = path.join(output, "candidate.tgz");
  writeFileSync(
    path.join(output, "pack.log"),
    command("corepack", ["pnpm@10.32.1", "pack", "--out", tarball])
  );
  const context = {
    full: full.report,
    fullStatus: full.status,
    production: production.report,
    productionStatus: production.status,
    version: manifest.version,
    now: Date.now(),
    approvedSource: process.env.RELEASE_AUDIT_APPROVED_SOURCE,
    source: process.env.GITHUB_SHA,
    checkout: command("git", ["rev-parse", "HEAD"]).trim(),
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    lock: hash(path.join(root, "pnpm-lock.yaml")),
    ...archiveIdentity(readFileSync(tarball)),
  };
  if (Object.keys(full.report.advisories ?? {}).length) {
    const versions = (name) =>
      JSON.parse(
        command("npm", [
          "view",
          name,
          "versions",
          "--json",
          "--registry=https://registry.npmjs.org",
        ])
      );
    context.publishedVersions = versions(manifest.name);
    context.registryVersions = Object.fromEntries(
      AUDIT_EXCEPTION.findings.map(({ name }) => [name, versions(name)])
    );
    writeFileSync(
      path.join(output, "registry.json"),
      JSON.stringify(
        {
          publishedVersions: context.publishedVersions,
          registryVersions: context.registryVersions,
        },
        null,
        2
      )
    );
  }
  const result = verifyReleaseAudit(context);
  writeFileSync(
    path.join(output, "receipt.json"),
    JSON.stringify(
      {
        ...result,
        source: context.source,
        version: context.version,
        lock: context.lock,
        artifact: context.artifact,
        payload: context.payload,
        checkedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(
    result.exception
      ? `Approved bounded development-tool exception; full audit is NOT clean. Expires ${result.expires}.`
      : "Full and production dependency audits are clean."
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
