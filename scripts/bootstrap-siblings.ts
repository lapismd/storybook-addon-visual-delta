const repositoryRoot = new URL("../", import.meta.url);
const declaration = JSON.parse(
  Deno.readTextFileSync(new URL("lapismd-workspace.json", repositoryRoot)),
) as {
  links: Array<{ path: string; revision: string }>;
};

const provider = declaration.links.find((link) =>
  link.path === "../spec-validator"
);
if (!provider) throw new Error("spec-validator sibling declaration is missing");

const providerRoot = new URL("../../spec-validator/", import.meta.url);
try {
  Deno.statSync(new URL("package.json", providerRoot));
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
  const clone = new Deno.Command("git", {
    args: [
      "clone",
      "https://github.com/lapismd/spec-validator.git",
      decodeURIComponent(providerRoot.pathname),
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  if (!(await clone.status).success) throw new Error("sibling clone failed");
  const checkout = new Deno.Command("git", {
    args: ["checkout", "--detach", provider.revision],
    cwd: providerRoot,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  if (!(await checkout.status).success) {
    throw new Error(`could not check out ${provider.revision}`);
  }
}

for (
  const args of [
    ["ci"],
    ["task", "workspace:sync"],
    ["task", "build"],
  ]
) {
  const child = new Deno.Command("deno", {
    args,
    cwd: providerRoot,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  if (!(await child.status).success) {
    throw new Error(`provider command failed: deno ${args.join(" ")}`);
  }
}
