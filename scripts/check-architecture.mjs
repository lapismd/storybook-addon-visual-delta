#!/usr/bin/env node
/**
 * VD-ARCH-006 architecture checker: counted-line budgets, dump filenames,
 * and production isolation from tests.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { countedLines, physicalLines } from "./architecture-lines.mjs";
import {
  DEFAULT_LIMITS,
  LIMIT_KEYS,
  fileKind,
  isDumpPath,
  isSourceFile,
  isTestSpecifier,
  toPosix,
} from "./architecture-policy.mjs";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-server",
  "storybook-static",
  "artifacts",
  ".release",
  ".local",
  ".visual-delta",
  ".ui-generator",
  "vendor",
  "coverage",
  "test-results",
  "playwright-report",
  "blob-report",
  ".cache",
  ".git",
  ".jj",
]);

const SOURCE_ROOTS = ["src", "scripts", "tests", ".storybook"];
const IMPORT_RE = /(?:from|import)\s*["']([^"']+)["']/g;

export function parseArgs(argv) {
  const options = { writeBaseline: false, root: process.cwd(), baseline: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write-baseline") options.writeBaseline = true;
    else if (arg === "--root") options.root = path.resolve(argv[++i] ?? "");
    else if (arg === "--baseline")
      options.baseline = path.resolve(argv[++i] ?? "");
  }
  return options;
}

function walkSources(root) {
  const files = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, full));
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (rel === "scripts/architecture-fixtures") continue;
        visit(full);
        continue;
      }
      if (isSourceFile(entry.name)) files.push(full);
    }
  };
  for (const name of SOURCE_ROOTS) visit(path.join(root, name));
  return files;
}

function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function sourceCommit(root) {
  try {
    return execFileSync(
      "jj",
      [
        "--no-pager",
        "log",
        "-r",
        "@",
        "-n",
        "1",
        "--no-graph",
        "-T",
        "commit_id",
      ],
      { cwd: root, encoding: "utf8" },
    ).trim();
  } catch {
    return "unknown";
  }
}

function productionTestImports(source) {
  const hits = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (isTestSpecifier(match[1])) hits.push(match[1]);
  }
  return hits;
}

export function checkArchitecture({
  root,
  writeBaseline = false,
  baselinePath,
  ci = process.env.CI === "true",
} = {}) {
  const repoRoot = path.resolve(root ?? process.cwd());
  const baselineFile =
    baselinePath ?? path.join(repoRoot, "scripts/architecture-baseline.json");
  const errors = [];
  const warnings = [];
  const report = (list, rule, message, file, line) => {
    list.push({ rule, message, file, line });
    const loc = [file, line].filter(Boolean).join(":");
    const text = `${loc ? `${loc} ` : ""}[${rule}] ${message}`;
    if (list === errors) console.error(text);
    else console.log(text);
  };

  if (ci && writeBaseline) {
    report(
      errors,
      "write-baseline-forbidden",
      "Refusing --write-baseline because CI=true",
    );
    return { ok: false, errors, warnings };
  }

  const files = walkSources(repoRoot);
  if (files.length === 0) {
    report(errors, "no-inputs", "architecture check found no source files");
    return { ok: false, errors, warnings };
  }

  const records = [];
  for (const full of files) {
    const posix = toPosix(path.relative(repoRoot, full));
    const source = fs.readFileSync(full, "utf8");
    records.push({
      posix,
      kind: fileKind(posix),
      counted: countedLines(source),
      physical: physicalLines(source),
      testImports: productionTestImports(source),
    });
  }

  const baseline = writeBaseline ? { files: {} } : readBaseline(baselineFile);
  if (!writeBaseline && !baseline) {
    report(
      errors,
      "architecture-baseline-missing",
      `architecture baseline missing: ${toPosix(path.relative(repoRoot, baselineFile)) || baselineFile}`,
    );
    return { ok: false, errors, warnings };
  }

  const limits = { ...DEFAULT_LIMITS, ...(baseline?.limits ?? {}) };
  const recorded = baseline?.files ?? {};
  if (!writeBaseline) {
    for (const posix of Object.keys(recorded)) {
      if (!records.some((record) => record.posix === posix))
        report(
          errors,
          "missing-baseline-path",
          `deleted or renamed; update baseline in this change: ${posix}`,
          posix,
        );
    }
  }

  const snapshot = {};
  for (const record of records) {
    if (isDumpPath(record.posix))
      report(
        errors,
        "dump-filename",
        "generic dump filename or directory is not allowed",
        record.posix,
      );
    if (record.kind === "production") {
      for (const specifier of record.testImports)
        report(
          errors,
          "production-test-import",
          `production module imports test ${specifier}`,
          record.posix,
        );
    }

    const priorEntry = recorded[record.posix];
    const limit = limits[LIMIT_KEYS[record.kind]];
    if (!writeBaseline && !priorEntry) {
      if (record.counted > limit)
        report(
          errors,
          "new-file-budget",
          `new ${record.kind} file ${record.counted}/${limit} counted lines`,
          record.posix,
        );
    } else if (!writeBaseline && priorEntry) {
      const budget = priorEntry.countedLines;
      if (record.counted > budget)
        report(
          errors,
          "counted-line-growth",
          `counted-line growth ${budget} -> ${record.counted}`,
          record.posix,
        );
      else if (record.counted + 20 < budget)
        report(
          errors,
          "stale-budget",
          `${record.posix} metric ${record.counted} + 20 < budget ${budget}`,
          record.posix,
        );
    }

    snapshot[record.posix] = {
      countedLines: record.counted,
      physicalLines: record.physical,
      kind: record.kind,
      forbiddenImportCount:
        record.kind === "production" ? record.testImports.length : 0,
    };
  }

  if (writeBaseline) {
    const payload = {
      version: 1,
      sourceCommit: sourceCommit(repoRoot),
      limits,
      files: Object.fromEntries(
        Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
    fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
    fs.writeFileSync(baselineFile, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(
      `Wrote ${Object.keys(snapshot).length} architecture baseline entries to ${baselineFile}`,
    );
    return { ok: errors.length === 0, errors, warnings, files: snapshot };
  }

  return { ok: errors.length === 0, errors, warnings, files: snapshot };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const options = parseArgs(process.argv.slice(2));
  const result = checkArchitecture({
    root: options.root,
    writeBaseline: options.writeBaseline,
    baselinePath: options.baseline,
  });
  process.exitCode = result.ok ? 0 : 1;
}
