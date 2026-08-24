const repositoryRoot = new URL("../", import.meta.url);
const repositoryPath = decodeURIComponent(repositoryRoot.pathname);
const findings: string[] = [];

const compatibility = JSON.parse(
  Deno.readTextFileSync(
    new URL("scripts/node-compatibility.json", repositoryRoot),
  ),
) as { adapters?: string[] };
const compatibilityAdapters = new Set(compatibility.adapters ?? []);
const expectedAdapters = [...compatibilityAdapters].sort();
if (
  JSON.stringify(compatibility.adapters) !== JSON.stringify(expectedAdapters)
) {
  findings.push("scripts/node-compatibility.json: adapters must be sorted");
}

function relativePath(url: URL): string {
  return decodeURIComponent(url.pathname).slice(repositoryPath.length);
}

function isTest(path: string): boolean {
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path);
}

function visit(
  directory: URL,
  check: (path: string, source: string) => void,
): void {
  for (const entry of Deno.readDirSync(directory)) {
    if (
      ["node_modules", "dist", "storybook-static", "book"].includes(entry.name)
    ) {
      continue;
    }
    const entryUrl = new URL(
      entry.name + (entry.isDirectory ? "/" : ""),
      directory,
    );
    if (entry.isDirectory) {
      visit(entryUrl, check);
    } else if (entry.isFile) {
      check(relativePath(entryUrl), Deno.readTextFileSync(entryUrl));
    }
  }
}

const activeRoots = [
  "package.json",
  "deno.json",
  "AGENTS.md",
  "README.md",
  "DEVELOPMENT.md",
  ".github/workflows/",
  ".storybook/",
  "docker/",
  "src/",
  "scripts/",
  "spec/src/",
  "spec/Makefile",
  ".changeset/README.md",
];
const retiredPatterns = [
  { pattern: /\bpnpm(?:\s|@|:|-lock|-workspace)\b/iu, label: "pnpm" },
  { pattern: /\bcorepack\b/iu, label: "Corepack" },
  { pattern: /\.turbo\b/iu, label: "Turbo cache" },
  { pattern: /\bturbo(?:repo)?(?:\s|@|:)\b/iu, label: "Turbo task" },
];

for (const activeRoot of activeRoots) {
  const url = new URL(activeRoot, repositoryRoot);
  const stat = Deno.statSync(url);
  const check = (path: string, source: string) => {
    if (
      isTest(path) ||
      path === "scripts/check-runtime-boundaries.ts" ||
      path === "scripts/check-ci-image.mjs"
    ) return;
    for (const rule of retiredPatterns) {
      if (rule.pattern.test(source)) {
        findings.push(path + ": active " + rule.label + " usage remains");
      }
    }
  };
  if (stat.isDirectory) visit(url, check);
  else check(activeRoot, Deno.readTextFileSync(url));
}

for (const retired of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json"]) {
  try {
    Deno.lstatSync(new URL(retired, repositoryRoot));
    findings.push(retired + ": retired package-manager file is still present");
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

const nodePatterns = [
  { pattern: /from\s+["']node:/u, label: "node import" },
  { pattern: /\brequire\s*\(/u, label: "CommonJS require" },
  { pattern: /\bprocess\./u, label: "process global" },
  { pattern: /\bBuffer\b/u, label: "Buffer global" },
];
for (const sourceRoot of ["src/", "scripts/"]) {
  visit(new URL(sourceRoot, repositoryRoot), (path, source) => {
    if (
      isTest(path) ||
      path === "scripts/check-runtime-boundaries.ts" ||
      path.startsWith("src/node/") ||
      path.startsWith("src/playwright/") ||
      path === "src/preset.ts" ||
      compatibilityAdapters.has(path)
    ) {
      return;
    }
    for (const rule of nodePatterns) {
      if (rule.pattern.test(source)) {
        findings.push(
          path + ": forbidden " + rule.label + " outside an adapter",
        );
      }
    }
  });
}

for (const adapter of compatibilityAdapters) {
  try {
    Deno.statSync(new URL(adapter, repositoryRoot));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      findings.push(
        "scripts/node-compatibility.json: missing adapter " + adapter,
      );
    } else {
      throw error;
    }
  }
}

const config = JSON.parse(
  Deno.readTextFileSync(new URL("deno.json", repositoryRoot)),
) as {
  name?: string;
  version?: string;
  exports?: Record<string, string>;
  links?: string[];
  nodeModulesDir?: string;
  nodeModulesLinker?: string;
  tasks?: Record<string, string>;
};
const packageManifest = JSON.parse(
  Deno.readTextFileSync(new URL("package.json", repositoryRoot)),
) as { name?: string; version?: string };
if (
  config.name !== packageManifest.name ||
  config.version !== packageManifest.version
) {
  findings.push("deno.json: package name and version must match package.json");
}
for (
  const packageExport of [
    ".",
    "./preview",
    "./preset",
    "./manager",
    "./visual-capture",
    "./playwright",
    "./node",
    "./runner",
  ]
) {
  if (typeof config.exports?.[packageExport] !== "string") {
    findings.push(`deno.json: missing portable export ${packageExport}`);
  }
}
if (!Array.isArray(config.links)) {
  findings.push("deno.json: native sibling links must be explicit");
}
if (!config.tasks?.["version:check"] || !config.tasks?.["workspace:sync"]) {
  findings.push("deno.json: exact-version or workspace-link task is missing");
}
if (
  config.nodeModulesDir !== "manual" ||
  config.nodeModulesLinker !== "isolated"
) {
  findings.push(
    "deno.json: node_modules must use manual installation with the isolated linker",
  );
}

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  Deno.exit(1);
}
console.log("Deno runtime boundary audit passed.");
