import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  completeGithubRelease,
  validateCompletion,
} from "./complete-github-release.mjs";

const source = "a".repeat(40);
const context = {
  repository: "lapismd/storybook-addon-visual-delta",
  version: "0.0.8",
  source,
  publicationRun: "123456",
  event: "workflow_dispatch",
  ref: "refs/heads/main",
  approved: "true",
};
function evidence() {
  return {
    tag: { ref: "refs/tags/v0.0.8", object: { type: "commit", sha: source } },
    run: {
      id: 123456,
      repository: { full_name: context.repository },
      head_sha: source,
      head_branch: "v0.0.8",
      event: "push",
      path: ".github/workflows/npm-publish.yml",
    },
    jobs: {
      total_count: 4,
      jobs: [
        "Validate release and package on x64",
        "Validate canonical visuals on ARM64",
        "Publish trusted release",
        "Verify npm Sigstore provenance",
      ].map((name) => ({ name, head_sha: source, conclusion: "success" })),
    },
  };
}
test("accepts only the original qualified stable tag/run", () => {
  const { tag, run, jobs } = evidence();
  assert.doesNotThrow(() => validateCompletion(context, tag, run, jobs));
  assert.doesNotThrow(() =>
    validateCompletion(
      {
        ...context,
        event: "push",
        ref: "refs/tags/v0.0.8",
        approved: undefined,
      },
      tag,
      run,
      jobs
    )
  );
});
for (const [name, mutate] of Object.entries({
  "unapproved recovery": (c) => {
    c.approved = "false";
  },
  fork: (c) => {
    c.repository = "other/fork";
  },
  "other branch": (c) => {
    c.ref = "refs/heads/other";
  },
  "invalid version": (c) => {
    c.version = "../other";
  },
  "abbreviated source": (c) => {
    c.source = "abc";
  },
  "invalid run": (c) => {
    c.publicationRun = "latest";
  },
  "missing tag": (c, e) => {
    e.tag = null;
  },
  "moved tag": (c, e) => {
    e.tag.object.sha = "b".repeat(40);
  },
  "wrong workflow": (c, e) => {
    e.run.path = ".github/workflows/other.yml";
  },
  "non-tag publication": (c, e) => {
    e.run.head_branch = "main";
  },
  "different source run": (c, e) => {
    e.run.head_sha = "b".repeat(40);
  },
  "missing jobs": (c, e) => {
    e.jobs.jobs.pop();
  },
  "failed provenance": (c, e) => {
    e.jobs.jobs[3].conclusion = "failure";
  },
  "skipped package gate": (c, e) => {
    e.jobs.jobs[0].conclusion = "skipped";
  },
  "different job source": (c, e) => {
    e.jobs.jobs[0].head_sha = "b".repeat(40);
  },
})) {
  test(`rejects ${name}`, () => {
    const c = { ...context };
    const e = evidence();
    mutate(c, e);
    assert.throws(() => validateCompletion(c, e.tag, e.run, e.jobs));
  });
}
function api(existing) {
  const e = evidence();
  const calls = [];
  return {
    calls,
    request: async (method, url, body) => {
      calls.push({ method, url, body });
      if (url.includes("/git/ref/")) return e.tag;
      if (url.includes("/jobs?")) return e.jobs;
      if (url.includes("/actions/runs/")) return e.run;
      if (method === "GET") return existing;
      return {
        ...body,
        html_url:
          "https://github.com/lapismd/storybook-addon-visual-delta/releases/tag/v0.0.8",
      };
    },
  };
}
test("creates only a missing verified GitHub release without tags or npm writes", async () => {
  const mock = api(null);
  const release = await completeGithubRelease(context, mock.request);
  assert.equal(release.tag_name, "v0.0.8");
  assert.equal(mock.calls.filter((call) => call.method !== "GET").length, 1);
  assert.ok(
    mock.calls.find((call) => call.method === "POST").url.endsWith("/releases")
  );
});
test("retains an existing exact public release without rewriting it", async () => {
  const mock = api({ tag_name: "v0.0.8", draft: false, prerelease: false });
  await completeGithubRelease(context, mock.request);
  assert.ok(mock.calls.every((call) => call.method === "GET"));
});
test("rejects unapproved recovery before using any API credential", async () => {
  const mock = api(null);
  await assert.rejects(
    completeGithubRelease({ ...context, approved: "false" }, mock.request)
  );
  assert.equal(mock.calls.length, 0);
});
test("rejects an existing draft or wrong release without editing it", async () => {
  const mock = api({ tag_name: "v0.0.8", draft: true, prerelease: false });
  await assert.rejects(completeGithubRelease(context, mock.request));
  assert.ok(mock.calls.every((call) => call.method === "GET"));
});
test("normal completion overrides skipped bootstrap while retaining explicit success gates", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/npm-publish.yml", import.meta.url),
    "utf8"
  );
  assert.match(
    workflow,
    /if: always\(\) && needs\.package-gate\.result == 'success' && needs\.verify-provenance\.result == 'success'/
  );
});
test("manual recovery has no npm publication or tag mutation", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/complete-npm-release.yml", import.meta.url),
    "utf8"
  );
  assert.match(workflow, /default: false/);
  assert.match(workflow, /inputs\.complete_release/);
  assert.doesNotMatch(
    workflow,
    /npm publish|release:tag|git push|id-token: write/
  );
});
