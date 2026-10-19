import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function approvedImageSource({ source, revision, approved, manifest }) {
  if (approved !== "true") throw Error("Image publication requires approval.");
  if (
    source?.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(source) ||
    source !== revision
  )
    throw Error("Image checkout must equal the exact approved source SHA.");
  const version = manifest?.devDependencies?.playwright;
  if (
    !/^\d+\.\d+\.\d+$/.test(version ?? "") ||
    version.trim() !== version ||
    manifest.devDependencies["@playwright/test"] !== version
  )
    throw Error(
      "Image Playwright runtime and test versions must be identical exact versions.",
    );
  return { source_revision: source, playwright_version: version };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const settings = approvedImageSource({
    source: process.env.CI_IMAGE_SOURCE,
    revision: execFileSync("git", ["-c", `safe.directory=${process.cwd()}`, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    approved: process.env.CI_IMAGE_PUBLICATION_APPROVED,
    manifest: JSON.parse(readFileSync("package.json", "utf8")),
  });
  settings.lock_sha256 = createHash("sha256")
    .update(readFileSync("pnpm-lock.yaml"))
    .digest("hex");
  const output = Object.entries(settings)
    .map(([key, value]) => `${key}=${value}\n`).join("");
  if (process.argv.includes("--stdout")) process.stdout.write(output);
  else {
    if (!process.env.GITHUB_OUTPUT) throw Error("Missing workflow output destination.");
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  }
}
