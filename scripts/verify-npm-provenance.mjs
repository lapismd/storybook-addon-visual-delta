#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PACKAGE_NAME,
  REPOSITORY_URL,
} from "./check-npm-release.mjs";

export const PROVENANCE_PREDICATE = "https://slsa.dev/provenance/v1";
export const PUBLISH_REPOSITORY = REPOSITORY_URL.replace(/\.git$/, "");
export const PUBLISH_WORKFLOW = ".github/workflows/npm-publish.yml";

export function npmPackagePurl(packageName, version) {
  const scopeSeparator = packageName.indexOf("/");
  const encodedScope = encodeURIComponent(
    packageName.slice(0, scopeSeparator),
  );
  const encodedName = encodeURIComponent(
    packageName.slice(scopeSeparator + 1),
  );
  const packagePath =
    packageName.startsWith("@") && scopeSeparator > 1
      ? `${encodedScope}/${encodedName}`
      : encodeURIComponent(packageName);
  return `pkg:npm/${packagePath}@${encodeURIComponent(version)}`;
}

function decodeStatement(bundle) {
  const payload = bundle?.dsseEnvelope?.payload;
  if (typeof payload !== "string") return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function verifyNpmProvenance(
  audit,
  {
    packageName = PACKAGE_NAME,
    version,
    repository = PUBLISH_REPOSITORY,
    workflow = PUBLISH_WORKFLOW,
  } = {},
) {
  const errors = [];
  if (!version) errors.push("version is required");

  const verified = Array.isArray(audit?.verified) ? audit.verified : [];
  const entry = verified.find(
    (candidate) =>
      candidate?.name === packageName && candidate?.version === version,
  );
  if (!entry) {
    errors.push(`no verified registry package matched ${packageName}@${version}`);
    return { ok: false, errors };
  }

  if (entry?.attestations?.provenance?.predicateType !== PROVENANCE_PREDICATE) {
    errors.push("verified package did not report a SLSA provenance attestation");
  }

  const bundle = entry.attestationBundles?.find(
    (candidate) => candidate?.predicateType === PROVENANCE_PREDICATE,
  )?.bundle;
  const statement = decodeStatement(bundle);
  if (!statement) {
    errors.push("verified package did not include a readable Sigstore provenance bundle");
    return { ok: false, errors };
  }

  const expectedSubject = npmPackagePurl(packageName, version);
  const subject = statement.subject?.find(
    (candidate) => candidate?.name === expectedSubject,
  );
  if (!subject?.digest?.sha512) {
    errors.push(`provenance did not bind the npm tarball ${expectedSubject}`);
  }
  if (statement.predicateType !== PROVENANCE_PREDICATE) {
    errors.push("Sigstore bundle did not contain a SLSA provenance statement");
  }

  const sourceWorkflow =
    statement.predicate?.buildDefinition?.externalParameters?.workflow;
  if (sourceWorkflow?.repository !== repository) {
    errors.push(`provenance repository must be ${repository}`);
  }
  if (sourceWorkflow?.path !== workflow) {
    errors.push(`provenance workflow must be ${workflow}`);
  }
  if (sourceWorkflow?.ref !== `refs/tags/v${version}`) {
    errors.push(`provenance tag must be refs/tags/v${version}`);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--audit") {
      options.audit = argv[++index];
    } else if (argument === "--version") {
      options.version = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.help && (!options.audit || !options.version)) {
    throw new Error("--audit and --version values must not be empty");
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-npm-provenance.mjs --audit path --version X.Y.Z

Validates npm audit signatures JSON for the public Visual Delta release.`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const audit = JSON.parse(readFileSync(options.audit, "utf8"));
    const result = verifyNpmProvenance(audit, options);
    if (!result.ok) {
      console.error("Visual Delta npm provenance verification failed:");
      for (const error of result.errors) console.error(`  - ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Visual Delta npm provenance verified for ${PACKAGE_NAME}@${options.version}.`,
    );
  } catch (error) {
    console.error(
      `Visual Delta npm provenance verification could not complete: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
