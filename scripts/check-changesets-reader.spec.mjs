import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("maintained Changesets reads the actual single-package pnpm workspace", async () => {
  const require = createRequire(import.meta.url);
  const cliRequire = createRequire(require.resolve("@changesets/cli/package.json"));
  const { getPackages } = cliRequire("@manypkg/get-packages");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const graph = await getPackages(root);
  assert.equal(graph.tool.type, "pnpm");
  assert.deepEqual(
    graph.packages.filter((entry) => !entry.packageJson.private).map((entry) => entry.packageJson.name),
    ["@lapismd/storybook-addon-visual-delta"],
  );
});
