import { dirname, fromFileUrl, resolve } from "jsr:@std/path@1.1.6";

const scriptDirectory = dirname(fromFileUrl(import.meta.url));
export const DEFAULT_CLI_PATH = resolve(
  scriptDirectory,
  "..",
  "dist",
  "node",
  "cli.js",
);
export const CLI_SHEBANG = "#!/usr/bin/env node";

export function prepareCliBin(cliPath = DEFAULT_CLI_PATH) {
  const source = Deno.readTextFileSync(cliPath);
  if (!source.startsWith(`${CLI_SHEBANG}\n`)) {
    throw new Error(`${cliPath} must start with ${CLI_SHEBANG}`);
  }

  Deno.chmodSync(cliPath, 0o755);
  const mode = (Deno.statSync(cliPath).mode ?? 0) & 0o777;
  if ((mode & 0o111) === 0) {
    throw new Error(`${cliPath} is not executable after package preparation`);
  }
  return { cliPath, mode };
}

if (import.meta.main) {
  try {
    const result = prepareCliBin();
    console.log(`Prepared executable Visual Delta CLI (${result.cliPath}).`);
  } catch (error) {
    console.error(
      `Could not prepare the Visual Delta CLI: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    Deno.exitCode = 1;
  }
}
