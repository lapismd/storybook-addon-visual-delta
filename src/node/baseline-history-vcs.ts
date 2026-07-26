import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { BaselineHistoryVcsKind } from "../shared/baseline-history.js";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 10_000;
const MAX_TEXT_BUFFER = 4 * 1024 * 1024;
const DEFAULT_SCAN_LIMIT = 1_000;

export type VcsFileRevision = {
  revisionId: string;
  displayId: string;
  secondaryId?: string;
  subject: string;
  message: string;
  author: string;
  authoredAt: string;
  /** Repo-relative path at this revision (may differ after a Git rename). */
  historicalPath: string;
};

export type VcsRevisionPage = {
  entries: VcsFileRevision[];
  nextOffset: number | null;
};

export interface BaselineHistoryVcs {
  kind: BaselineHistoryVcsKind;
  root: string;
  followsRenames: boolean;
  listFileRevisions(
    relativePath: string,
    options: { offset: number; limit: number },
  ): Promise<VcsRevisionPage>;
  findFileRevision(
    relativePath: string,
    revisionId: string,
  ): Promise<VcsFileRevision | null>;
  readFileAtRevision(revision: VcsFileRevision): Promise<Buffer>;
}

type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<string>;

async function runText(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_TEXT_BUFFER,
  });
  return result.stdout;
}

function short(value: string, length = 12): string {
  return value.slice(0, length);
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0] || "(no description)";
}

function escapeJjString(value: string): string {
  return JSON.stringify(value);
}

type JjCommitJson = {
  commit_id: string;
  change_id: string;
  description?: string;
  author?: { name?: string; timestamp?: string };
};

export class JjBaselineHistoryVcs implements BaselineHistoryVcs {
  readonly kind = "jj" as const;
  readonly followsRenames = false;

  constructor(
    readonly root: string,
    private readonly run: CommandRunner = runText,
  ) {}

  private async all(relativePath: string, limit: number): Promise<VcsFileRevision[]> {
    const revset = `ancestors(@-) & files(${escapeJjString(relativePath)})`;
    const stdout = await this.run(
      "jj",
      [
        "--ignore-working-copy",
        "--no-pager",
        "--color=never",
        "log",
        "--no-graph",
        "-r",
        revset,
        "-n",
        String(limit),
        "-T",
        'json(self) ++ "\\n"',
      ],
      this.root,
    );
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JjCommitJson)
      .map((commit) => {
        const message = commit.description?.trim() ?? "";
        return {
          revisionId: commit.commit_id,
          displayId: short(commit.change_id),
          secondaryId: short(commit.commit_id),
          subject: firstLine(message),
          message,
          author: commit.author?.name?.trim() || "Unknown author",
          authoredAt: commit.author?.timestamp ?? "",
          historicalPath: relativePath,
        };
      });
  }

  async listFileRevisions(
    relativePath: string,
    { offset, limit }: { offset: number; limit: number },
  ): Promise<VcsRevisionPage> {
    const all = await this.all(relativePath, offset + limit + 1);
    return {
      entries: all.slice(offset, offset + limit),
      nextOffset: all.length > offset + limit ? offset + limit : null,
    };
  }

  async findFileRevision(
    relativePath: string,
    revisionId: string,
  ): Promise<VcsFileRevision | null> {
    if (!/^[0-9a-f]{40,64}$/i.test(revisionId)) return null;
    const entries = await this.all(relativePath, DEFAULT_SCAN_LIMIT);
    return entries.find((entry) => entry.revisionId === revisionId) ?? null;
  }

  async readFileAtRevision(revision: VcsFileRevision): Promise<Buffer> {
    const result = await execFileAsync(
      "jj",
      [
        "--ignore-working-copy",
        "--no-pager",
        "--color=never",
        "file",
        "show",
        "-r",
        revision.revisionId,
        revision.historicalPath,
      ],
      {
        cwd: this.root,
        encoding: "buffer",
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return Buffer.from(result.stdout);
  }
}

type GitMetadata = {
  revisionId: string;
  author: string;
  authoredAt: string;
  subject: string;
  message: string;
};

function parseGitLog(stdout: string): GitMetadata[] {
  return stdout
    .split("\x1e")
    .map((record) => record.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean)
    .map((record) => {
      const [revisionId, author, authoredAt, subject, ...messageParts] =
        record.split("\x1f");
      return {
        revisionId: revisionId ?? "",
        author: author?.trim() || "Unknown author",
        authoredAt: authoredAt?.trim() ?? "",
        subject: subject?.trim() || "(no description)",
        message: messageParts.join("\x1f").trim(),
      };
    })
    .filter((entry) => /^[0-9a-f]{40,64}$/i.test(entry.revisionId));
}

export class GitBaselineHistoryVcs implements BaselineHistoryVcs {
  readonly kind = "git" as const;
  readonly followsRenames = true;

  constructor(
    readonly root: string,
    private readonly run: CommandRunner = runText,
  ) {}

  private async renameBefore(
    revisionId: string,
    currentPath: string,
  ): Promise<string> {
    const stdout = await this.run(
      "git",
      [
        "-c",
        "core.quotepath=false",
        "diff-tree",
        "--root",
        "--no-commit-id",
        "--name-status",
        "-r",
        "-M",
        revisionId,
      ],
      this.root,
    );
    for (const line of stdout.split(/\r?\n/)) {
      const [status, from, to] = line.split("\t");
      if (status?.startsWith("R") && to === currentPath && from) return from;
    }
    return currentPath;
  }

  private async all(relativePath: string, limit: number): Promise<VcsFileRevision[]> {
    const stdout = await this.run(
      "git",
      [
        "log",
        "--follow",
        `--max-count=${limit}`,
        "--date=iso-strict",
        "--format=%H%x1f%an%x1f%aI%x1f%s%x1f%B%x1e",
        "--",
        relativePath,
      ],
      this.root,
    );
    const commits = parseGitLog(stdout);
    let historicalPath = relativePath;
    const entries: VcsFileRevision[] = [];
    for (const commit of commits) {
      entries.push({
        ...commit,
        displayId: short(commit.revisionId),
        historicalPath,
      });
      historicalPath = await this.renameBefore(
        commit.revisionId,
        historicalPath,
      );
    }
    return entries;
  }

  async listFileRevisions(
    relativePath: string,
    { offset, limit }: { offset: number; limit: number },
  ): Promise<VcsRevisionPage> {
    const all = await this.all(relativePath, offset + limit + 1);
    return {
      entries: all.slice(offset, offset + limit),
      nextOffset: all.length > offset + limit ? offset + limit : null,
    };
  }

  async findFileRevision(
    relativePath: string,
    revisionId: string,
  ): Promise<VcsFileRevision | null> {
    if (!/^[0-9a-f]{40,64}$/i.test(revisionId)) return null;
    const entries = await this.all(relativePath, DEFAULT_SCAN_LIMIT);
    return entries.find((entry) => entry.revisionId === revisionId) ?? null;
  }

  async readFileAtRevision(revision: VcsFileRevision): Promise<Buffer> {
    const result = await execFileAsync(
      "git",
      ["show", `${revision.revisionId}:${revision.historicalPath}`],
      {
        cwd: this.root,
        encoding: "buffer",
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return Buffer.from(result.stdout);
  }
}

export async function detectBaselineHistoryVcs(
  cwd: string,
  run: CommandRunner = runText,
): Promise<BaselineHistoryVcs | null> {
  try {
    const root = (
      await run(
        "jj",
        ["--ignore-working-copy", "--no-pager", "--color=never", "root"],
        cwd,
      )
    ).trim();
    if (root) return new JjBaselineHistoryVcs(root, run);
  } catch {
    // A Git-only host or a machine without jj is expected.
  }
  try {
    const root = (
      await run("git", ["rev-parse", "--show-toplevel"], cwd)
    ).trim();
    if (root) return new GitBaselineHistoryVcs(root, run);
  } catch {
    // No supported VCS.
  }
  return null;
}

export async function workingFileDiffers(
  absolutePath: string,
  committed: Buffer | null,
): Promise<boolean> {
  const current = await readFile(absolutePath);
  return !committed || !current.equals(committed);
}
