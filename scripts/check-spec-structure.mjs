#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const REQUIRED_ROOT_MARKDOWN = ["AGENTS.md", "DEVELOPMENT.md", "README.md"];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function markdownFiles(directory, base = directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolutePath, base);
    if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
    return [toPosix(path.relative(base, absolutePath))];
  });
}

function localMarkdownTargets(source) {
  const targets = [];
  for (const match of source.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#|\?)/.test(target)) continue;
    targets.push(target);
  }
  return targets;
}

function targetFile(target) {
  return target.split("#", 1)[0];
}

function addLinkErrors({ files, directory, packageRoot, errors }) {
  for (const relativePath of files) {
    const absolutePath = path.join(directory, relativePath);
    const source = readFileSync(absolutePath, "utf8");
    for (const target of localMarkdownTargets(source)) {
      const fileTarget = targetFile(target);
      if (!fileTarget) continue;
      const resolved = path.resolve(path.dirname(absolutePath), fileTarget);
      if (!existsSync(resolved)) {
        errors.push(
          `${toPosix(path.relative(packageRoot, absolutePath))}: broken link ${target}`,
        );
      }
    }
  }
}

export function validateSpecStructure({
  packageRoot = DEFAULT_PACKAGE_ROOT,
} = {}) {
  const sourceDirectory = path.join(packageRoot, "spec", "src");
  const obsoleteSpecDirectory = path.join(packageRoot, "specs");
  const summaryPath = path.join(sourceDirectory, "SUMMARY.md");
  const verificationPath = path.join(sourceDirectory, "verification.md");
  const bookConfigPath = path.join(packageRoot, "spec", "book.toml");
  const errors = [];

  if (!existsSync(summaryPath)) errors.push("spec/src/SUMMARY.md is missing");
  if (!existsSync(verificationPath)) {
    errors.push("spec/src/verification.md is missing");
  }
  if (!existsSync(bookConfigPath)) errors.push("spec/book.toml is missing");

  const sourceFiles = markdownFiles(sourceDirectory);
  const canonicalFiles = sourceFiles
    .filter((file) => file !== "SUMMARY.md")
    .sort();
  const rootMarkdownFiles = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  addLinkErrors({
    files: sourceFiles,
    directory: sourceDirectory,
    packageRoot,
    errors,
  });

  if (existsSync(obsoleteSpecDirectory)) {
    errors.push("obsolete specs/ directory must not exist; use spec/src/");
  }
  for (const file of REQUIRED_ROOT_MARKDOWN) {
    if (!rootMarkdownFiles.includes(file)) {
      errors.push(`${file}: required package-root Markdown file is missing`);
    }
  }
  for (const file of rootMarkdownFiles) {
    if (!REQUIRED_ROOT_MARKDOWN.includes(file)) {
      errors.push(
        `${file}: package-root Markdown is limited to ${REQUIRED_ROOT_MARKDOWN.join(", ")}`,
      );
    }
  }

  if (existsSync(summaryPath)) {
    const summary = readFileSync(summaryPath, "utf8");
    const summaryTargets = localMarkdownTargets(summary)
      .map(targetFile)
      .filter((target) => target.endsWith(".md"))
      .map((target) =>
        toPosix(path.normalize(path.join(path.dirname("SUMMARY.md"), target))),
      );
    const counts = new Map();
    for (const target of summaryTargets) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    for (const file of canonicalFiles) {
      const count = counts.get(file) ?? 0;
      if (count !== 1) {
        errors.push(
          `spec/src/${file}: expected one SUMMARY.md entry, found ${count}`,
        );
      }
    }
    for (const [target, count] of counts) {
      if (!canonicalFiles.includes(target)) {
        errors.push(`spec/src/SUMMARY.md: stale chapter ${target}`);
      } else if (count !== 1) {
        errors.push(
          `spec/src/SUMMARY.md: chapter ${target} appears ${count} times`,
        );
      }
    }
  }

  const requirementDefinitions = [];
  for (const file of canonicalFiles) {
    const source = readFileSync(path.join(sourceDirectory, file), "utf8");
    for (const match of source.matchAll(/^\|\s*(VD-[A-Z]+-\d{3})\s*\|/gm)) {
      requirementDefinitions.push({ id: match[1], file });
    }
  }

  const definitionsById = new Map();
  for (const definition of requirementDefinitions) {
    const current = definitionsById.get(definition.id) ?? [];
    current.push(definition.file);
    definitionsById.set(definition.id, current);
  }
  for (const [id, files] of definitionsById) {
    if (files.length !== 1) {
      errors.push(
        `${id}: defined ${files.length} times in ${files.join(", ")}`,
      );
    }
  }

  if (existsSync(verificationPath)) {
    const verification = readFileSync(verificationPath, "utf8");
    for (const id of definitionsById.keys()) {
      if (!verification.includes(id)) {
        errors.push(`${id}: missing from spec/src/verification.md`);
      }
    }
  }

  if (existsSync(bookConfigPath)) {
    const bookConfig = readFileSync(bookConfigPath, "utf8");
    if (!/^\s*src\s*=\s*"src"\s*$/m.test(bookConfig)) {
      errors.push('spec/book.toml: [book] src must be "src"');
    }
    if (!/^\s*build-dir\s*=\s*"book"\s*$/m.test(bookConfig)) {
      errors.push('spec/book.toml: build-dir must be "book"');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      pages: canonicalFiles.length,
      requirements: requirementDefinitions.length,
    },
  };
}

function main() {
  const result = validateSpecStructure();
  if (!result.ok) {
    console.error("Visual Delta specification validation failed:");
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Visual Delta specification validated: ${result.stats.pages} pages, ${result.stats.requirements} requirements.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
