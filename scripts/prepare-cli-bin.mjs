#!/usr/bin/env node

import { chmodSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CLI_PATH = path.resolve(
  SCRIPT_DIR,
  "..",
  "dist",
  "node",
  "cli.js",
);
export const CLI_SHEBANG = "#!/usr/bin/env node";

export function prepareCliBin(cliPath = DEFAULT_CLI_PATH) {
  const source = readFileSync(cliPath, "utf8");
  if (!source.startsWith(`${CLI_SHEBANG}\n`)) {
    throw new Error(`${cliPath} must start with ${CLI_SHEBANG}`);
  }

  chmodSync(cliPath, 0o755);
  const mode = statSync(cliPath).mode & 0o777;
  if ((mode & 0o111) === 0) {
    throw new Error(`${cliPath} is not executable after package preparation`);
  }
  return { cliPath, mode };
}

function main() {
  try {
    const result = prepareCliBin();
    console.log(`Prepared executable Visual Delta CLI (${result.cliPath}).`);
  } catch (error) {
    console.error(
      `Could not prepare the Visual Delta CLI: ${
        error instanceof Error ? error.message : String(error)
      }`,
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
