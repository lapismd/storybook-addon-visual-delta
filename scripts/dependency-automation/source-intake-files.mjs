import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export function readCanonicalIntakeFiles(root, notes = []) {
  const read = (path) => {
    const target = resolve(root, path);
    if (realpathSync(target) !== target || !lstatSync(target).isFile())
      throw Error("Visual Delta canonical intake: non-regular source path");
    return readFileSync(target, "utf8");
  };
  const policyBytes = read(
    ".github/dependency-automation/canonical-intake.json",
  );
  const inputs = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"];
  const chapters = [
    "spec/src/dependency-automation.md",
    "spec/src/host-profile.md",
  ];
  return {
    files: Object.fromEntries([...inputs, ...notes].map((p) => [p, read(p)])),
    documents: Object.fromEntries(chapters.map((p) => [p, read(p)])),
    policyBytes,
  };
}
