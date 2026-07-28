import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 8 * 1024 * 1024;

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
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return result.stdout;
}

function normalizeRelative(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe VCS path: ${value}`);
  }
  return normalized;
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/, 1)[0] ?? "";
}

export interface VisualDeltaChangeVcs {
  readonly kind: "jj" | "git";
  readonly root: string;
  readonly projectRoot: string;
  baseRevision(): Promise<string | null>;
  dirtyPaths(): Promise<string[]>;
  readBaseFile(relativePath: string): Promise<Buffer | null>;
  commitPaths(
    relativePaths: string[],
    message: string,
    newPaths: string[],
  ): Promise<{ revisionId: string; displayId: string }>;
}

abstract class BaseChangeVcs implements VisualDeltaChangeVcs {
  abstract readonly kind: "jj" | "git";

  constructor(
    readonly root: string,
    readonly projectRoot: string,
    protected readonly run: CommandRunner = runText,
  ) {}

  protected repoPath(projectPath: string): string {
    const absolute = path.resolve(
      this.projectRoot,
      normalizeRelative(projectPath),
    );
    const relative = path
      .relative(this.root, absolute)
      .replaceAll(path.sep, "/");
    return normalizeRelative(relative);
  }

  protected projectPath(repoPath: string): string | null {
    const absolute = path.resolve(this.root, repoPath);
    const relative = path
      .relative(this.projectRoot, absolute)
      .replaceAll(path.sep, "/");
    if (
      !relative ||
      relative === "." ||
      relative.startsWith("../") ||
      path.posix.isAbsolute(relative)
    ) {
      return null;
    }
    return relative;
  }

  abstract baseRevision(): Promise<string | null>;
  abstract dirtyPaths(): Promise<string[]>;
  abstract readBaseFile(relativePath: string): Promise<Buffer | null>;
  abstract commitPaths(
    relativePaths: string[],
    message: string,
    newPaths: string[],
  ): Promise<{ revisionId: string; displayId: string }>;
}

export class JjVisualDeltaChangeVcs extends BaseChangeVcs {
  readonly kind = "jj" as const;

  async baseRevision(): Promise<string | null> {
    try {
      const value = await this.run(
        "jj",
        [
          "--no-pager",
          "--color=never",
          "log",
          "--no-graph",
          "-r",
          "@-",
          "-T",
          "commit_id",
        ],
        this.root,
      );
      return value.trim() || null;
    } catch {
      return null;
    }
  }

  async dirtyPaths(): Promise<string[]> {
    const stdout = await this.run(
      "jj",
      ["--no-pager", "--color=never", "diff", "--name-only"],
      this.root,
    );
    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => this.projectPath(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ].sort();
  }

  async readBaseFile(relativePath: string): Promise<Buffer | null> {
    try {
      const result = await execFileAsync(
        "jj",
        [
          "--no-pager",
          "--color=never",
          "file",
          "show",
          "-r",
          "@-",
          "--",
          this.repoPath(relativePath),
        ],
        {
          cwd: this.root,
          encoding: "buffer",
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      return Buffer.from(result.stdout);
    } catch {
      return null;
    }
  }

  async commitPaths(
    relativePaths: string[],
    message: string,
  ): Promise<{ revisionId: string; displayId: string }> {
    const repoPaths = relativePaths.map((entry) => this.repoPath(entry));
    await this.run(
      "jj",
      ["--no-pager", "commit", "-m", message, "--", ...repoPaths],
      this.root,
    );
    const revisionId = (
      await this.run(
        "jj",
        [
          "--no-pager",
          "--color=never",
          "log",
          "--no-graph",
          "-r",
          "@-",
          "-T",
          "commit_id",
        ],
        this.root,
      )
    ).trim();
    const displayId = (
      await this.run(
        "jj",
        [
          "--no-pager",
          "--color=never",
          "log",
          "--no-graph",
          "-r",
          "@-",
          "-T",
          "change_id.shortest(12)",
        ],
        this.root,
      )
    ).trim();
    return { revisionId, displayId: displayId || revisionId.slice(0, 12) };
  }
}

function nulPaths(stdout: string): string[] {
  return stdout.split("\0").filter(Boolean);
}

export class GitVisualDeltaChangeVcs extends BaseChangeVcs {
  readonly kind = "git" as const;

  async baseRevision(): Promise<string | null> {
    try {
      return (await this.run("git", ["rev-parse", "HEAD"], this.root)).trim();
    } catch {
      return null;
    }
  }

  async dirtyPaths(): Promise<string[]> {
    const [working, staged, untracked] = await Promise.all([
      this.run("git", ["diff", "--name-only", "-z"], this.root),
      this.run("git", ["diff", "--cached", "--name-only", "-z"], this.root),
      this.run(
        "git",
        ["ls-files", "--others", "--exclude-standard", "-z"],
        this.root,
      ),
    ]);
    return [
      ...new Set(
        [...nulPaths(working), ...nulPaths(staged), ...nulPaths(untracked)]
          .map((entry) => this.projectPath(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ].sort();
  }

  async readBaseFile(relativePath: string): Promise<Buffer | null> {
    try {
      const result = await execFileAsync(
        "git",
        ["show", `HEAD:${this.repoPath(relativePath)}`],
        {
          cwd: this.root,
          encoding: "buffer",
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      return Buffer.from(result.stdout);
    } catch {
      return null;
    }
  }

  async commitPaths(
    relativePaths: string[],
    message: string,
    newPaths: string[],
  ): Promise<{ revisionId: string; displayId: string }> {
    const repoPaths = relativePaths.map((entry) => this.repoPath(entry));
    const newRepoPaths = newPaths.map((entry) => this.repoPath(entry));
    if (newRepoPaths.length) {
      await this.run(
        "git",
        ["add", "--intent-to-add", "--", ...newRepoPaths],
        this.root,
      );
    }
    try {
      await this.run(
        "git",
        ["commit", "--only", "-m", message, "--", ...repoPaths],
        this.root,
      );
    } catch (error) {
      if (newRepoPaths.length) {
        await this.run(
          "git",
          ["reset", "--quiet", "--", ...newRepoPaths],
          this.root,
        ).catch(() => "");
      }
      throw error;
    }
    const revisionId = (
      await this.run("git", ["rev-parse", "HEAD"], this.root)
    ).trim();
    return { revisionId, displayId: revisionId.slice(0, 12) };
  }
}

function hasVcsMarker(directory: string, marker: ".jj" | ".git"): boolean {
  const candidate = path.join(directory, marker);
  if (!existsSync(candidate)) return false;
  try {
    return statSync(candidate).isDirectory() || statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function detectVisualDeltaVcsKind(cwd: string): "jj" | "git" | null {
  let current = path.resolve(cwd);
  while (true) {
    if (hasVcsMarker(current, ".jj")) return "jj";
    if (hasVcsMarker(current, ".git")) return "git";
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function detectVisualDeltaChangeVcs(
  cwd: string,
  run: CommandRunner = runText,
): Promise<VisualDeltaChangeVcs | null> {
  try {
    const root = firstLine(
      await run(
        "jj",
        ["--ignore-working-copy", "--no-pager", "--color=never", "root"],
        cwd,
      ),
    );
    if (root) return new JjVisualDeltaChangeVcs(root, cwd, run);
  } catch {
    // Git-only host or jj unavailable.
  }
  try {
    const root = firstLine(
      await run("git", ["rev-parse", "--show-toplevel"], cwd),
    );
    if (root) return new GitVisualDeltaChangeVcs(root, cwd, run);
  } catch {
    // No supported VCS.
  }
  return null;
}
