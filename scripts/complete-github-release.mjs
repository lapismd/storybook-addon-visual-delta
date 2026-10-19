import path from "node:path";
import { pathToFileURL } from "node:url";

const repository = "lapismd/storybook-addon-visual-delta";

export function validateCompletionContext(context) {
  const requireValue = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  requireValue(
    context.repository === repository,
    "Canonical repository required"
  );
  requireValue(
    /^\d+\.\d+\.\d+$/.test(context.version ?? ""),
    "Stable version required"
  );
  requireValue(
    /^[a-f0-9]{40}$/.test(context.source ?? ""),
    "Exact source required"
  );
  requireValue(
    /^\d+$/.test(context.publicationRun ?? ""),
    "Original publication run required"
  );
  const expectedTag = `v${context.version}`;
  const normal =
    context.event === "push" && context.ref === `refs/tags/${expectedTag}`;
  const recovery =
    context.event === "workflow_dispatch" &&
    context.ref === "refs/heads/main" &&
    context.approved === "true";
  requireValue(
    normal || recovery,
    "Explicit default-branch recovery or tag event required"
  );
}

export function validateCompletion(context, tag, run, jobs) {
  validateCompletionContext(context);
  const requireValue = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const expectedTag = `v${context.version}`;
  requireValue(
    tag?.object?.type === "commit" &&
      tag.object.sha === context.source &&
      tag.ref === `refs/tags/${expectedTag}`,
    "Existing immutable tag/source differs"
  );
  requireValue(
    String(run?.id) === context.publicationRun &&
      run?.repository?.full_name === repository &&
      run.head_sha === context.source &&
      run.head_branch === expectedTag &&
      run.event === "push" &&
      run.path === ".github/workflows/npm-publish.yml",
    "Original publication run differs"
  );
  requireValue(
    Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length,
    "Complete latest job evidence required"
  );
  const publisher =
    context.version === "0.0.1"
      ? "Publish bootstrap release"
      : "Publish trusted release";
  for (const name of [
    "Validate release and package on x64",
    "Validate canonical visuals on ARM64",
    publisher,
    "Verify npm Sigstore provenance",
  ]) {
    const matches = jobs.jobs.filter((job) => job.name === name);
    requireValue(
      matches.length === 1 &&
        matches[0].conclusion === "success" &&
        matches[0].head_sha === context.source,
      `Unqualified release gate: ${name}`
    );
  }
}

export async function completeGithubRelease(context, request) {
  validateCompletionContext(context);
  const prefix = `/repos/${context.repository}`;
  const [tag, run, jobs] = await Promise.all([
    request("GET", `${prefix}/git/ref/tags/v${context.version}`),
    request("GET", `${prefix}/actions/runs/${context.publicationRun}`),
    request(
      "GET",
      `${prefix}/actions/runs/${context.publicationRun}/jobs?filter=latest&per_page=100`
    ),
  ]);
  validateCompletion(context, tag, run, jobs);
  let release = await request(
    "GET",
    `${prefix}/releases/tags/v${context.version}`,
    undefined,
    true
  );
  if (!release) {
    release = await request("POST", `${prefix}/releases`, {
      tag_name: `v${context.version}`,
      name: `@lapismd/storybook-addon-visual-delta v${context.version}`,
      body: `Published \`@lapismd/storybook-addon-visual-delta@${context.version}\`.\n\nTag: \`v${context.version}\` at \`${context.source}\`.\n\nnpm package/ARM64 checks, trusted publication and Sigstore verification passed.\n\nOriginal publication: https://github.com/${repository}/actions/runs/${context.publicationRun}`,
      draft: false,
      prerelease: false,
    });
  }
  if (
    release.tag_name !== `v${context.version}` ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new Error(
      "Existing release does not match the verified public stable tag"
    );
  }
  return release;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const context = {
      repository: process.env.GITHUB_REPOSITORY,
      version: process.env.VERSION,
      source: process.env.RELEASE_SOURCE ?? process.env.GITHUB_SHA,
      publicationRun:
        process.env.PUBLICATION_RUN_ID ?? process.env.GITHUB_RUN_ID,
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      approved: process.env.COMPLETION_APPROVED,
    };
    const request = async (method, pathname, body, allowMissing = false) => {
      const response = await fetch(`https://api.github.com${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (allowMissing && response.status === 404) return null;
      if (!response.ok)
        throw new Error(`GitHub ${method} ${pathname}: ${response.status}`);
      return response.json();
    };
    const release = await completeGithubRelease(context, request);
    console.log(`Verified GitHub release: ${release.html_url}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
