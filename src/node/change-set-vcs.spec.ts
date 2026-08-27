import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  detectVisualDeltaChangeVcs,
  GitVisualDeltaChangeVcs,
  JjVisualDeltaChangeVcs,
} from "./change-set-vcs.js";

function command(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

function hasCommand(commandName: string): boolean {
  return (
    spawnSync(commandName, ["--version"], {
      stdio: "ignore",
    }).status === 0
  );
}

describe("Visual Delta change VCS adapters", () => {
  it("detects Jujutsu first and commits only exact project paths", async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const run = vi.fn(async (command: string, args: string[], cwd: string) => {
      calls.push({ command, args, cwd });
      if (args.includes("root")) return "/repo\n";
      if (args.includes("diff")) return "packages/ui/story.ts\nother.txt\n";
      if (args.includes("change_id.shortest(12)")) return "change123456\n";
      if (args.includes("commit_id")) return `${"a".repeat(40)}\n`;
      return "";
    });
    const adapter = await detectVisualDeltaChangeVcs("/repo/packages/ui", run);

    expect(adapter).toBeInstanceOf(JjVisualDeltaChangeVcs);
    expect(await adapter!.dirtyPaths()).toEqual(["story.ts"]);
    await adapter!.commitPaths(["story.ts"], "Approve visual", []);
    expect(calls).toContainEqual({
      command: "jj",
      args: [
        "--no-pager",
        "commit",
        "-m",
        "Approve visual",
        "--",
        "packages/ui/story.ts",
      ],
      cwd: "/repo",
    });
  });

  it("uses Git exact-path commit and intent-to-add only for new files", async () => {
    const calls: Array<string[]> = [];
    const run = vi.fn(async (_command: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "diff" && !args.includes("--cached"))
        return "packages/ui/story.ts\0";
      if (args[0] === "diff" && args.includes("--cached")) return "other.txt\0";
      if (args[0] === "ls-files") return "packages/ui/new.png\0";
      if (args[0] === "rev-parse") return `${"b".repeat(40)}\n`;
      return "";
    });
    const adapter = new GitVisualDeltaChangeVcs(
      "/repo",
      "/repo/packages/ui",
      run,
    );

    expect(await adapter.dirtyPaths()).toEqual(["new.png", "story.ts"]);
    await adapter.commitPaths(["story.ts", "new.png"], "Update visual", [
      "new.png",
    ]);
    expect(calls).toContainEqual([
      "add",
      "--intent-to-add",
      "--",
      "packages/ui/new.png",
    ]);
    expect(calls).toContainEqual([
      "commit",
      "--only",
      "-m",
      "Update visual",
      "--",
      "packages/ui/story.ts",
      "packages/ui/new.png",
    ]);
  });

  it.skipIf(!hasCommand("git"))(
    "commits added and modified Git paths while preserving unrelated staged work",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "visual-delta-git-"));
      command("git", ["init", "--quiet"], root);
      command("git", ["config", "user.name", "Visual Delta Test"], root);
      command(
        "git",
        ["config", "user.email", "visual-delta@example.invalid"],
        root,
      );
      writeFileSync(join(root, "visual.txt"), "before\n");
      writeFileSync(join(root, "unrelated.txt"), "before\n");
      command("git", ["add", "--", "visual.txt", "unrelated.txt"], root);
      command("git", ["commit", "--quiet", "-m", "Initial"], root);

      writeFileSync(join(root, "visual.txt"), "after\n");
      writeFileSync(join(root, "created.txt"), "created\n");
      writeFileSync(join(root, "unrelated.txt"), "staged unrelated\n");
      command("git", ["add", "--", "unrelated.txt"], root);

      const adapter = new GitVisualDeltaChangeVcs(root, root);
      await adapter.commitPaths(
        ["visual.txt", "created.txt"],
        "Visual Delta test",
        ["created.txt"],
      );

      expect(
        command(
          "git",
          ["show", "--pretty=format:", "--name-only", "HEAD"],
          root,
        )
          .trim()
          .split(/\r?\n/)
          .sort(),
      ).toEqual(["created.txt", "visual.txt"]);
      expect(
        command("git", ["diff", "--cached", "--name-only"], root).trim(),
      ).toBe("unrelated.txt");
      expect(readFileSync(join(root, "unrelated.txt"), "utf8")).toBe(
        "staged unrelated\n",
      );
    },
    15_000,
  );

  it.skipIf(!hasCommand("jj"))(
    "commits only exact Jujutsu paths and leaves unrelated working-copy edits",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "visual-delta-jj-"));
      command("jj", ["git", "init", "--colocate", root], root);
      writeFileSync(join(root, "visual.txt"), "before\n");
      writeFileSync(join(root, "unrelated.txt"), "before\n");
      command("jj", ["commit", "-m", "Initial"], root);

      writeFileSync(join(root, "visual.txt"), "after\n");
      writeFileSync(join(root, "unrelated.txt"), "working unrelated\n");

      const adapter = new JjVisualDeltaChangeVcs(root, root);
      await adapter.commitPaths(["visual.txt"], "Visual Delta test");

      expect(
        command(
          "jj",
          ["--no-pager", "diff", "--name-only", "-r", "@"],
          root,
        ).trim(),
      ).toBe("unrelated.txt");
      expect(
        command(
          "jj",
          ["--no-pager", "file", "show", "-r", "@-", "--", "visual.txt"],
          root,
        ),
      ).toBe("after\n");
      expect(readFileSync(join(root, "unrelated.txt"), "utf8")).toBe(
        "working unrelated\n",
      );
    },
    15_000,
  );
});
