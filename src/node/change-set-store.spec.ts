import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_VISUAL_DELTA_WORKFLOW } from "../shared/workflow-config.js";
import { VisualDeltaChangeSetStore } from "./change-set-store.js";
import type { VisualDeltaChangeVcs } from "./change-set-vcs.js";

function workflow(mode: "off" | "review" | "auto") {
  return {
    ...BUILTIN_VISUAL_DELTA_WORKFLOW,
    vcs: { ...BUILTIN_VISUAL_DELTA_WORKFLOW.vcs, mode },
  };
}

function fakeVcs(options: {
  dirty: string[][];
  baseFiles?: Record<string, string>;
  baseRevisions?: Array<string | null>;
  commitError?: Error;
}) {
  let call = 0;
  let baseCall = 0;
  const commitPaths = vi.fn(async () => {
    if (options.commitError) throw options.commitError;
    return {
      revisionId: "a".repeat(40),
      displayId: "change123456",
    };
  });
  const vcs: VisualDeltaChangeVcs = {
    kind: "jj",
    root: "/repo",
    projectRoot: "/repo",
    baseRevision: async () =>
      options.baseRevisions?.[
        Math.min(baseCall++, options.baseRevisions.length - 1)
      ] ?? "b".repeat(40),
    dirtyPaths: async () =>
      options.dirty[Math.min(call++, options.dirty.length - 1)] ?? [],
    readBaseFile: async (relativePath) => {
      const value = options.baseFiles?.[relativePath];
      return value == null ? null : Buffer.from(value);
    },
    commitPaths,
  };
  return { vcs, commitPaths };
}

describe("VisualDeltaChangeSetStore", () => {
  it("records and commits only the exact clean path changed by the operation", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "before\n");
    writeFileSync(join(root, "unrelated.ts"), "local edit\n");
    const { vcs, commitPaths } = fakeVcs({
      dirty: [["unrelated.ts"], ["unrelated.ts", "story.ts"]],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const operation = await store.begin({
      action: "review-status",
      scope: "story",
      storyIds: ["story"],
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "story.ts"), "after\n");
    const mutation = await operation.finish({ success: true });

    expect(mutation.changeSet?.files.map((file) => file.path)).toEqual([
      "story.ts",
    ]);
    expect(mutation.changeSet?.commitAllowed).toBe(true);
    await store.commit(mutation.changeSetId!, "Approve visual");
    expect(commitPaths).toHaveBeenCalledWith(
      ["story.ts"],
      "Approve visual",
      [],
    );
  });

  it("blocks a touched path that was dirty before the operation", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "local edit\n");
    const { vcs } = fakeVcs({
      dirty: [["story.ts"], ["story.ts"]],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const operation = await store.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "story.ts"), "local edit plus tag\n");
    const mutation = await operation.finish({ success: true });

    expect(mutation.changeSet?.state).toBe("blocked");
    expect(mutation.changeSet?.commitAllowed).toBe(false);
    expect(mutation.changeSet?.blockReasons.join(" ")).toMatch(
      /unrelated changes/,
    );
  });

  it("blocks a commit when the repository base revision changed", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "before\n");
    const { vcs, commitPaths } = fakeVcs({
      dirty: [[], ["story.ts"]],
      baseRevisions: ["before", "after"],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const operation = await store.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "story.ts"), "after\n");
    const mutation = await operation.finish({ success: true });

    await expect(
      store.commit(mutation.changeSetId!, "Approve visual"),
    ).rejects.toThrow(/base revision changed/);
    expect(store.list().changeSets[0]?.state).toBe("blocked");
    expect(commitPaths).not.toHaveBeenCalled();
  });

  it("blocks unexpected operation paths and post-capture file drift", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "before\n");
    writeFileSync(join(root, "unexpected.ts"), "before\n");
    const { vcs, commitPaths } = fakeVcs({
      dirty: [[], ["story.ts", "unexpected.ts"]],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const operation = await store.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "story.ts"), "after\n");
    writeFileSync(join(root, "unexpected.ts"), "external\n");
    const mutation = await operation.finish({ success: true });

    expect(mutation.changeSet?.state).toBe("blocked");
    expect(mutation.changeSet?.blockReasons.join(" ")).toMatch(
      /outside this operation/,
    );
    expect(commitPaths).not.toHaveBeenCalled();

    const root2 = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root2, "story.ts"), "before\n");
    const second = fakeVcs({ dirty: [[], ["story.ts"]] });
    const store2 = new VisualDeltaChangeSetStore(
      root2,
      true,
      async () => second.vcs,
    );
    const operation2 = await store2.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root2, "story.ts"), "after\n");
    const mutation2 = await operation2.finish({ success: true });
    writeFileSync(join(root2, "story.ts"), "changed again\n");

    await expect(
      store2.commit(mutation2.changeSetId!, "Approve visual"),
    ).rejects.toThrow(/changed after Visual Delta/);
    expect(store2.list().changeSets[0]?.state).toBe("blocked");
  });

  it("keeps failed mutations review-only and omits no-op change sets", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "before\n");
    const { vcs } = fakeVcs({
      dirty: [[], [], [], ["story.ts"]],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const noOp = await store.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    expect(await noOp.finish({ success: true })).not.toHaveProperty(
      "changeSetId",
    );
    expect(store.list().changeSets).toHaveLength(0);

    const failed = await store.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "story.ts"), "partial\n");
    const mutation = await failed.finish({
      success: false,
      error: "patch failed",
    });
    expect(mutation.changeSet?.state).toBe("failed");
    expect(mutation.changeSet?.commitAllowed).toBe(false);
  });

  it("merges sequential operations and reloads their bounded review data", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "one.ts"), "before\n");
    writeFileSync(join(root, "two.ts"), "before\n");
    const { vcs } = fakeVcs({
      dirty: [[], ["one.ts"], ["one.ts"], ["one.ts", "two.ts"]],
    });
    const detect = async () => vcs;
    const store = new VisualDeltaChangeSetStore(root, true, detect);
    const first = await store.begin({
      action: "review-status",
      scope: "one",
      expectedPaths: ["one.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "one.ts"), "after\n");
    const firstResult = await first.finish({ success: true });
    const second = await store.begin({
      action: "review-status",
      scope: "two",
      expectedPaths: ["two.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "two.ts"), "after\n");
    const secondResult = await second.finish({ success: true });

    expect(secondResult.changeSetId).toBe(firstResult.changeSetId);
    expect(secondResult.changeSet?.operations).toHaveLength(2);
    expect(secondResult.changeSet?.files.map((file) => file.path)).toEqual([
      "one.ts",
      "two.ts",
    ]);
    const restored = new VisualDeltaChangeSetStore(root, true, detect);
    expect(restored.list().changeSets[0]?.operations).toHaveLength(2);
  });

  it("enforces the host write gate and preserves commit-command failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "before\n");
    const gated = fakeVcs({ dirty: [[], ["story.ts"]] });
    const store = new VisualDeltaChangeSetStore(
      root,
      false,
      async () => gated.vcs,
    );
    const operation = await store.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root, "story.ts"), "after\n");
    const mutation = await operation.finish({ success: true });
    expect(mutation.changeSet?.commitAllowed).toBe(false);
    await expect(
      store.commit(mutation.changeSetId!, "Approve visual"),
    ).rejects.toThrow(/disabled by the Storybook host/);

    const root2 = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root2, "story.ts"), "before\n");
    const failing = fakeVcs({
      dirty: [[], ["story.ts"]],
      commitError: new Error("commit hook failed"),
    });
    const store2 = new VisualDeltaChangeSetStore(
      root2,
      true,
      async () => failing.vcs,
    );
    const operation2 = await store2.begin({
      action: "review-status",
      scope: "story",
      expectedPaths: ["story.ts"],
      workflow: workflow("review"),
    });
    writeFileSync(join(root2, "story.ts"), "after\n");
    const mutation2 = await operation2.finish({ success: true });
    await expect(
      store2.commit(mutation2.changeSetId!, "Approve visual"),
    ).rejects.toThrow(/commit hook failed/);
    expect(store2.list().changeSets[0]?.commitError).toBe("commit hook failed");
  });

  it("auto-commits a safe successful mutation but not a forced-review policy write", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    mkdirSync(join(root, ".visual-delta"), { recursive: true });
    writeFileSync(join(root, ".visual-delta/config.json"), "{}\n");
    const { vcs, commitPaths } = fakeVcs({
      dirty: [[], [".visual-delta/config.json"]],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const operation = await store.begin({
      action: "project-config",
      scope: "project configuration",
      expectedPaths: [".visual-delta/config.json"],
      workflow: workflow("auto"),
      forceReview: true,
    });
    writeFileSync(join(root, ".visual-delta/config.json"), '{"workflow":{}}\n');
    const mutation = await operation.finish({ success: true });

    expect(mutation.mode).toBe("review");
    expect(mutation.autoCommit).toBeUndefined();
    expect(commitPaths).not.toHaveBeenCalled();
  });

  it("auto-commits a safe ordinary operation", async () => {
    const root = mkdtempSync(join(tmpdir(), "visual-delta-changes-"));
    writeFileSync(join(root, "story.ts"), "before\n");
    const { vcs, commitPaths } = fakeVcs({
      dirty: [[], ["story.ts"]],
    });
    const store = new VisualDeltaChangeSetStore(root, true, async () => vcs);
    const operation = await store.begin({
      action: "auto-accept",
      scope: "story",
      storyIds: ["story"],
      expectedPaths: ["story.ts"],
      workflow: workflow("auto"),
    });
    writeFileSync(join(root, "story.ts"), "after\n");
    const mutation = await operation.finish({ success: true });

    expect(commitPaths).toHaveBeenCalledOnce();
    expect(mutation.autoCommit?.displayId).toBe("change123456");
    expect(mutation.changeSet?.state).toBe("committed");
  });
});
