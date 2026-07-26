import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaselineHistoryEndpoint } from "./baseline-history-endpoint.js";
import type {
  BaselineHistoryVcs,
  VcsFileRevision,
} from "./baseline-history-vcs.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const tempDirs: string[] = [];

function responseRecorder() {
  const headers = new Map<string, string>();
  let body: Buffer = Buffer.alloc(0);
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(value: string | Buffer = "") {
      body = Buffer.isBuffer(value) ? value : Buffer.from(value);
    },
  } as unknown as ServerResponse;
  return {
    response,
    headers,
    status: () => response.statusCode,
    json: () => JSON.parse(body.toString("utf8")) as Record<string, unknown>,
    body: () => body,
  };
}

function request(method: string, url: string): IncomingMessage {
  return { method, url } as IncomingMessage;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "visual-delta-history-"));
  tempDirs.push(root);
  const snapshotDir = path.join(root, "snapshots");
  const relative = "component/example.png";
  await mkdir(path.dirname(path.join(snapshotDir, relative)), {
    recursive: true,
  });
  const working = Buffer.concat([PNG, Buffer.from("working")]);
  await writeFile(path.join(snapshotDir, relative), working);
  const revision: VcsFileRevision = {
    revisionId: "a".repeat(40),
    displayId: "change123456",
    secondaryId: "aaaaaaaaaaaa",
    subject: "Add baseline",
    message: "Add baseline\n\nFor the component.",
    author: "Visual Tester",
    authoredAt: "2026-07-26T10:00:00Z",
    historicalPath: `snapshots/${relative}`,
  };
  const vcs: BaselineHistoryVcs = {
    kind: "jj",
    root,
    followsRenames: false,
    listFileRevisions: vi.fn(async () => ({
      entries: [revision],
      nextOffset: 50,
    })),
    findFileRevision: vi.fn(async (_path, id) =>
      id === revision.revisionId ? revision : null,
    ),
    readFileAtRevision: vi.fn(async () => PNG),
    diffRevisions: vi.fn(
      async () => `diff --git a/src/component/Example.svelte b/src/component/Example.svelte
--- a/src/component/Example.svelte
+++ b/src/component/Example.svelte
@@ -1 +1 @@
-<div>Before</div>
+<div>After</div>
`,
    ),
  };
  const endpoint = createBaselineHistoryEndpoint({
    root,
    hostOptions: { snapshotDir: "snapshots" },
    detectVcs: async () => vcs,
  });
  return { endpoint, relative, revision, vcs, working };
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("baseline history endpoint", () => {
  it("returns normalized revisions, working bytes, pagination, and no-store", async () => {
    const { endpoint, relative } = await fixture();
    const recorder = responseRecorder();
    const req = request(
      "GET",
      `/__visual-delta/baseline-history?path=${encodeURIComponent(relative)}`,
    );

    expect(
      await endpoint.handle(
        req,
        recorder.response,
        new URL(req.url!, "http://localhost"),
      ),
    ).toBe(true);
    expect(recorder.status()).toBe(200);
    expect(recorder.headers.get("cache-control")).toBe("no-store");
    expect(recorder.json()).toMatchObject({
      ok: true,
      vcs: "jj",
      followsRenames: false,
      entries: [
        { source: "working-copy", displayId: "Working copy" },
        {
          source: "commit",
          subject: "Add baseline",
          secondaryId: "aaaaaaaaaaaa",
        },
      ],
    });
    expect(recorder.json().nextCursor).toEqual(expect.any(String));
  });

  it("serves only reachable PNG revisions", async () => {
    const { endpoint, relative, revision } = await fixture();
    const good = responseRecorder();
    const goodReq = request(
      "GET",
      `/__visual-delta/baseline-history/image?path=${encodeURIComponent(relative)}&revision=${revision.revisionId}`,
    );

    await endpoint.handle(
      goodReq,
      good.response,
      new URL(goodReq.url!, "http://localhost"),
    );
    expect(good.status()).toBe(200);
    expect(good.headers.get("content-type")).toBe("image/png");
    expect(good.body()).toEqual(PNG);

    const missing = responseRecorder();
    const missingReq = request(
      "GET",
      `/__visual-delta/baseline-history/image?path=${encodeURIComponent(relative)}&revision=${"b".repeat(40)}`,
    );
    await endpoint.handle(
      missingReq,
      missing.response,
      new URL(missingReq.url!, "http://localhost"),
    );
    expect(missing.status()).toBe(404);
  });

  it("rejects traversal and unsupported methods", async () => {
    const { endpoint } = await fixture();
    const traversal = responseRecorder();
    const traversalReq = request(
      "GET",
      "/__visual-delta/baseline-history?path=../secret.png",
    );
    await endpoint.handle(
      traversalReq,
      traversal.response,
      new URL(traversalReq.url!, "http://localhost"),
    );
    expect(traversal.status()).toBe(400);

    const method = responseRecorder();
    const methodReq = request(
      "POST",
      "/__visual-delta/baseline-history?path=component/example.png",
    );
    await endpoint.handle(
      methodReq,
      method.response,
      new URL(methodReq.url!, "http://localhost"),
    );
    expect(method.status()).toBe(405);
    expect(method.headers.get("allow")).toBe("GET");
  });

  it("returns an aligned component-source diff for reachable revisions", async () => {
    const { endpoint, relative, revision, vcs } = await fixture();
    const recorder = responseRecorder();
    const req = request(
      "GET",
      `/__visual-delta/baseline-history/diff?path=${encodeURIComponent(relative)}&before=${revision.revisionId}&after=working-copy&componentPath=${encodeURIComponent("src/component/Example.stories.svelte")}`,
    );

    await endpoint.handle(
      req,
      recorder.response,
      new URL(req.url!, "http://localhost"),
    );

    expect(recorder.status()).toBe(200);
    expect(recorder.json()).toMatchObject({
      ok: true,
      beforeRevisionId: revision.revisionId,
      afterRevisionId: "working-copy",
      files: [
        {
          afterPath: "src/component/Example.svelte",
          hunks: [
            {
              lines: [
                {
                  before: "<div>Before</div>",
                  after: "<div>After</div>",
                  kind: "changed",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(vcs.diffRevisions).toHaveBeenCalledWith(
      revision.revisionId,
      "working-copy",
    );
  });
});
