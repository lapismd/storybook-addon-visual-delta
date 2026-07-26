import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectBaselineHistoryVcs,
  GitBaselineHistoryVcs,
  JjBaselineHistoryVcs,
} from "./baseline-history-vcs.js";

const execFileAsync = promisify(execFile);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const tempDirs: string[] = [];

async function tempRepo(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function command(
  cwd: string,
  executable: string,
  args: string[],
): Promise<void> {
  await execFileAsync(executable, args, {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
}

async function writeVersion(
  root: string,
  relative: string,
  suffix: string,
): Promise<Buffer> {
  const bytes = Buffer.concat([PNG, Buffer.from(suffix)]);
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
  return bytes;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("Git baseline history adapter", () => {
  it("lists current ancestry, follows a rename, and reads historical bytes", async () => {
    const root = await tempRepo("visual-delta-git-");
    await command(root, "git", ["init"]);
    await command(root, "git", ["config", "user.name", "Visual Tester"]);
    await command(root, "git", ["config", "user.email", "visual@example.test"]);
    const original = "snapshots/original.png";
    const renamed = "snapshots/renamed.png";
    const first = await writeVersion(root, original, "first");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src/Card.tsx"),
      "export const card = 1;\n",
    );
    await command(root, "git", ["add", original]);
    await command(root, "git", ["add", "src/Card.tsx"]);
    await command(root, "git", [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Add original baseline",
    ]);
    await rename(path.join(root, original), path.join(root, renamed));
    await command(root, "git", ["add", "-A"]);
    await command(root, "git", [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Rename baseline",
    ]);
    await writeVersion(root, renamed, "latest");
    await writeFile(
      path.join(root, "src/Card.tsx"),
      "export const card = 2;\n",
    );
    await command(root, "git", ["add", renamed]);
    await command(root, "git", ["add", "src/Card.tsx"]);
    await command(root, "git", [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Update renamed baseline",
    ]);

    const adapter = new GitBaselineHistoryVcs(root);
    const page = await adapter.listFileRevisions(renamed, {
      offset: 0,
      limit: 10,
    });

    expect(page.entries.map((entry) => entry.subject)).toEqual([
      "Update renamed baseline",
      "Rename baseline",
      "Add original baseline",
    ]);
    expect(page.entries.at(-1)?.historicalPath).toBe(original);
    expect(await adapter.readFileAtRevision(page.entries.at(-1)!)).toEqual(
      first,
    );
    await expect(
      adapter.diffRevisions(
        page.entries.at(-1)!.revisionId,
        page.entries[0]!.revisionId,
      ),
    ).resolves.toContain("+export const card = 2;");
    expect(page.nextOffset).toBeNull();
  }, 15_000);

  it("warns when Git reports a shallow checkout", async () => {
    const adapter = new GitBaselineHistoryVcs(
      "/repo",
      async (_command, args) =>
        args.includes("--is-shallow-repository") ? "true\n" : "",
    );

    await expect(adapter.historyWarnings()).resolves.toEqual([
      "This is a shallow Git checkout, so older baseline revisions may be unavailable.",
    ]);
  });
});

describe("Jujutsu baseline history adapter", () => {
  it("uses stable change ids and reads commits without snapshotting the workspace", async () => {
    const root = await tempRepo("visual-delta-jj-");
    await command(root, "jj", ["git", "init", "--colocate", "."]);
    const relative = "snapshots/example.png";
    const first = await writeVersion(root, relative, "first");
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src/Card.tsx"),
      "export const card = 1;\n",
    );
    await command(root, "jj", ["commit", "-m", "Add baseline"]);
    await writeVersion(root, relative, "second");
    await writeFile(
      path.join(root, "src/Card.tsx"),
      "export const card = 2;\n",
    );
    await command(root, "jj", ["commit", "-m", "Update baseline"]);

    const adapter = new JjBaselineHistoryVcs(root);
    const page = await adapter.listFileRevisions(relative, {
      offset: 0,
      limit: 10,
    });

    expect(page.entries.map((entry) => entry.subject)).toEqual([
      "Update baseline",
      "Add baseline",
    ]);
    expect(page.entries[0]?.displayId).toHaveLength(12);
    expect(page.entries[0]?.secondaryId).toHaveLength(12);
    expect(await adapter.readFileAtRevision(page.entries.at(-1)!)).toEqual(
      first,
    );
    await expect(
      adapter.diffRevisions(
        page.entries.at(-1)!.revisionId,
        page.entries[0]!.revisionId,
      ),
    ).resolves.toContain("+export const card = 2;");
  });

  it("prefers JJ when a checkout also has Git metadata", async () => {
    const root = await tempRepo("visual-delta-detect-");
    await command(root, "jj", ["git", "init", "--colocate", "."]);

    const adapter = await detectBaselineHistoryVcs(root);

    expect(adapter?.kind).toBe("jj");
  });
});
