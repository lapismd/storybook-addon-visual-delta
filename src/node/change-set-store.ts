import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type {
  VisualDeltaChangeAction,
  VisualDeltaChangeFile,
  VisualDeltaChangeOperation,
  VisualDeltaChangeSet,
  VisualDeltaChangeSetMutation,
  VisualDeltaChangeSetsResponse,
} from "../shared/change-sets.js";
import { visualDeltaChangeSetFileUrl } from "../shared/change-sets.js";
import {
  migrateLegacyChangeSetCache,
  VISUAL_DELTA_CHANGE_SETS_CACHE_REL,
} from "./cache-paths.js";
import type {
  VisualDeltaVcsMode,
  VisualDeltaWorkflowConfig,
} from "../shared/config-types.js";
import { renderVisualDeltaCommitMessage } from "../shared/workflow-config.js";
import {
  detectVisualDeltaChangeVcs,
  type VisualDeltaChangeVcs,
} from "./change-set-vcs.js";

const MAX_CHANGE_SETS = 25;
const STATE_VERSION = 1;

type StoredChangeFile = VisualDeltaChangeFile & {
  beforeBlob?: string;
  afterBlob?: string;
};

type StoredChangeSet = Omit<VisualDeltaChangeSet, "files"> & {
  files: StoredChangeFile[];
};

type PersistedState = {
  version: typeof STATE_VERSION;
  changeSets: StoredChangeSet[];
};

type FileSnapshot = {
  bytes: Buffer | null;
  hash: string | null;
};

export type VisualDeltaMutationOptions = {
  action: VisualDeltaChangeAction;
  scope: string;
  storyIds?: string[];
  expectedPaths?: string[];
  expectedPrefixes?: string[];
  workflow: VisualDeltaWorkflowConfig;
  /** Project configuration policy changes always require manual review. */
  forceReview?: boolean;
};

export type VisualDeltaMutationSession = {
  operationId: string;
  finish(options: {
    success: boolean;
    error?: string;
  }): Promise<VisualDeltaChangeSetMutation>;
};

function normalizeRelative(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe change-set path: ${value}`);
  }
  return normalized;
}

function hashBytes(bytes: Buffer | null): string | null {
  return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
}

function readWorkingFile(root: string, relativePath: string): Buffer | null {
  const absolute = path.resolve(root, normalizeRelative(relativePath));
  if (
    absolute !== root &&
    !absolute.startsWith(`${path.resolve(root)}${path.sep}`)
  ) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  try {
    return readFileSync(absolute);
  } catch {
    return null;
  }
}

function snapshot(root: string, relativePath: string): FileSnapshot {
  const bytes = readWorkingFile(root, relativePath);
  return { bytes, hash: hashBytes(bytes) };
}

function isImagePath(relativePath: string): boolean {
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(relativePath);
}

function isBinary(bytes: Buffer | null, relativePath: string): boolean {
  if (!bytes) return isImagePath(relativePath);
  if (isImagePath(relativePath)) return true;
  return bytes.subarray(0, 8_000).includes(0);
}

function displayId(value: string): string {
  return value.slice(0, 12);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function scopeMessageValues(options: VisualDeltaMutationOptions) {
  const ids = options.storyIds ?? [];
  const storyId = ids.length === 1 ? ids[0] : undefined;
  return {
    action: options.action.replaceAll("-", " "),
    scope: options.scope,
    storyId,
    storyName: storyId,
    count: ids.length || 1,
  };
}

function fileChange(
  beforeHash: string | null,
  afterHash: string | null,
): VisualDeltaChangeFile["change"] {
  if (!beforeHash && afterHash) return "added";
  if (beforeHash && !afterHash) return "deleted";
  return "modified";
}

export class VisualDeltaChangeSetStore {
  private readonly cacheRoot: string;
  private readonly statePath: string;
  private changeSets: StoredChangeSet[] = [];
  private vcsPromise: Promise<VisualDeltaChangeVcs | null> | null = null;

  constructor(
    private readonly root: string,
    private readonly allowVcsWrites: boolean,
    private readonly detectVcs: (
      root: string,
    ) => Promise<VisualDeltaChangeVcs | null> = detectVisualDeltaChangeVcs,
  ) {
    migrateLegacyChangeSetCache(root);
    this.cacheRoot = path.join(root, ...VISUAL_DELTA_CHANGE_SETS_CACHE_REL.split("/"));
    this.statePath = path.join(this.cacheRoot, "index.json");
    this.load();
  }

  private vcs(): Promise<VisualDeltaChangeVcs | null> {
    this.vcsPromise ??= this.detectVcs(this.root);
    return this.vcsPromise;
  }

  private load() {
    if (!existsSync(this.statePath)) return;
    try {
      const parsed = JSON.parse(
        readFileSync(this.statePath, "utf8"),
      ) as PersistedState;
      if (
        parsed.version === STATE_VERSION &&
        Array.isArray(parsed.changeSets)
      ) {
        this.changeSets = parsed.changeSets.slice(0, MAX_CHANGE_SETS);
      }
    } catch {
      this.changeSets = [];
    }
  }

  private persist() {
    mkdirSync(this.cacheRoot, { recursive: true });
    for (const removed of this.changeSets.splice(MAX_CHANGE_SETS)) {
      try {
        rmSync(this.blobDirectory(removed.id), {
          force: true,
          recursive: true,
        });
      } catch {
        // Ignore malformed legacy cache entries; never broaden the delete path.
      }
    }
    const next: PersistedState = {
      version: STATE_VERSION,
      changeSets: this.changeSets,
    };
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(temporary, this.statePath);
  }

  private writeBlob(
    changeSetId: string,
    relativePath: string,
    phase: "before" | "after",
    bytes: Buffer | null,
  ): string | undefined {
    if (!bytes) return undefined;
    const directory = this.blobDirectory(changeSetId);
    mkdirSync(directory, { recursive: true });
    const key = createHash("sha256")
      .update(`${relativePath}:${phase}`)
      .digest("hex");
    const filename = `${key}.${phase}`;
    writeFileSync(path.join(directory, filename), bytes);
    return filename;
  }

  private readBlob(
    changeSet: StoredChangeSet,
    file: StoredChangeFile,
    phase: "before" | "after",
  ): Buffer | null {
    const filename = phase === "before" ? file.beforeBlob : file.afterBlob;
    if (!filename) return null;
    try {
      const directory = this.blobDirectory(changeSet.id);
      const absolute = path.resolve(directory, filename);
      if (
        absolute === directory ||
        !absolute.startsWith(`${directory}${path.sep}`)
      ) {
        return null;
      }
      return readFileSync(absolute);
    } catch {
      return null;
    }
  }

  private removeBlob(changeSetId: string, filename: string) {
    const directory = this.blobDirectory(changeSetId);
    const absolute = path.resolve(directory, filename);
    if (
      absolute !== directory &&
      absolute.startsWith(`${directory}${path.sep}`)
    ) {
      rmSync(absolute, { force: true });
    }
  }

  private blobDirectory(changeSetId: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(changeSetId)) {
      throw new Error("Invalid Visual Delta change-set identifier.");
    }
    return path.join(this.cacheRoot, changeSetId);
  }

  private publicFile(
    changeSetId: string,
    file: StoredChangeFile,
  ): VisualDeltaChangeFile {
    const { beforeBlob, afterBlob, ...result } = file;
    return {
      ...result,
      ...(beforeBlob
        ? {
            beforeUrl: visualDeltaChangeSetFileUrl({
              changeSetId,
              path: file.path,
              phase: "before",
            }),
          }
        : {}),
      ...(afterBlob
        ? {
            afterUrl: visualDeltaChangeSetFileUrl({
              changeSetId,
              path: file.path,
              phase: "after",
            }),
          }
        : {}),
    };
  }

  private publicSet(changeSet: StoredChangeSet): VisualDeltaChangeSet {
    return {
      ...changeSet,
      files: changeSet.files.map((file) => this.publicFile(changeSet.id, file)),
    };
  }

  list(): VisualDeltaChangeSetsResponse {
    return {
      ok: true,
      pendingCount: this.changeSets.filter((item) => item.state !== "committed")
        .length,
      changeSets: this.changeSets.map((item) => this.publicSet(item)),
    };
  }

  get(changeSetId: string): VisualDeltaChangeSet | undefined {
    const changeSet = this.changeSets.find((item) => item.id === changeSetId);
    return changeSet ? this.publicSet(changeSet) : undefined;
  }

  file(
    changeSetId: string,
    relativePath: string,
    phase: "before" | "after",
  ): { bytes: Buffer; contentType: string } | null {
    const changeSet = this.changeSets.find((item) => item.id === changeSetId);
    const normalized = normalizeRelative(relativePath);
    const file = changeSet?.files.find((item) => item.path === normalized);
    if (!changeSet || !file) return null;
    const bytes = this.readBlob(changeSet, file, phase);
    if (!bytes) return null;
    const ext = path.extname(normalized).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : file.binary
                ? "application/octet-stream"
                : "text/plain; charset=utf-8";
    return { bytes, contentType };
  }

  async begin(
    options: VisualDeltaMutationOptions,
  ): Promise<VisualDeltaMutationSession> {
    const operationId = randomUUID();
    const vcs = await this.vcs();
    const baseRevision = await vcs?.baseRevision().catch(() => null);
    const dirtyPaths = (await vcs?.dirtyPaths().catch(() => [])) ?? [];
    const expectedPaths = unique(
      (options.expectedPaths ?? []).map(normalizeRelative),
    );
    const beforePaths = unique([...dirtyPaths, ...expectedPaths]);
    const before = new Map(
      beforePaths.map((relativePath) => [
        relativePath,
        snapshot(this.root, relativePath),
      ]),
    );
    let finished = false;

    return {
      operationId,
      finish: async ({ success, error }) => {
        if (finished)
          throw new Error(`Operation already finished: ${operationId}`);
        finished = true;
        return this.finishMutation({
          operationId,
          options,
          vcs,
          baseRevision: baseRevision ?? null,
          dirtyBefore: new Set(dirtyPaths),
          before,
          success,
          error,
        });
      },
    };
  }

  private async finishMutation(input: {
    operationId: string;
    options: VisualDeltaMutationOptions;
    vcs: VisualDeltaChangeVcs | null;
    baseRevision: string | null;
    dirtyBefore: Set<string>;
    before: Map<string, FileSnapshot>;
    success: boolean;
    error?: string;
  }): Promise<VisualDeltaChangeSetMutation> {
    const {
      operationId,
      options,
      vcs,
      baseRevision,
      dirtyBefore,
      before,
      success,
      error,
    } = input;
    const dirtyAfter = (await vcs?.dirtyPaths().catch(() => [])) ?? [];
    const expectedPaths = unique(
      (options.expectedPaths ?? []).map(normalizeRelative),
    );
    const expectedPrefixes = unique(
      (options.expectedPrefixes ?? [])
        .map((entry) => entry.replaceAll("\\", "/").replace(/^\.\//, ""))
        .map((entry) => (entry.endsWith("/") ? entry : `${entry}/`)),
    );
    const candidates = unique([
      ...before.keys(),
      ...dirtyAfter,
      ...expectedPaths,
    ]);
    const allowed = (relativePath: string) =>
      expectedPaths.includes(relativePath) ||
      expectedPrefixes.some((prefix) => relativePath.startsWith(prefix));

    const existing = this.changeSets.find(
      (item) =>
        item.state !== "committed" &&
        item.baseRevision === baseRevision &&
        item.vcs === (vcs?.kind ?? null),
    );
    const now = new Date().toISOString();
    const mode: VisualDeltaVcsMode = options.forceReview
      ? "review"
      : options.workflow.vcs.mode;
    const changeSet: StoredChangeSet = existing ?? {
      id: randomUUID(),
      state: "pending",
      createdAt: now,
      updatedAt: now,
      baseRevision,
      vcs: vcs?.kind ?? null,
      mode,
      message: renderVisualDeltaCommitMessage(
        options.workflow.vcs.commitMessageTemplate,
        scopeMessageValues(options),
      ),
      operations: [],
      files: [],
      blockReasons: [],
      commitAllowed: false,
    };
    const owned = new Map(
      changeSet.files.map((file) => [file.path, file.afterHash]),
    );
    const operationFiles: Array<{
      path: string;
      before: FileSnapshot;
      after: FileSnapshot;
      unsafeReason?: string;
    }> = [];

    for (const relativePath of candidates) {
      const currentBefore =
        before.get(relativePath) ??
        ({
          bytes: vcs
            ? await vcs.readBaseFile(relativePath).catch(() => null)
            : null,
          hash: null,
        } satisfies FileSnapshot);
      if (currentBefore.hash == null && currentBefore.bytes) {
        currentBefore.hash = hashBytes(currentBefore.bytes);
      }
      const after = snapshot(this.root, relativePath);
      if (currentBefore.hash === after.hash) continue;

      let unsafeReason: string | undefined;
      if (!allowed(relativePath)) {
        unsafeReason = "Changed outside this operation's declared paths.";
      } else if (dirtyBefore.has(relativePath)) {
        const ownedHash = owned.get(relativePath);
        if (!owned.has(relativePath) || ownedHash !== currentBefore.hash) {
          unsafeReason =
            "This file contained unrelated changes before Visual Delta touched it.";
        }
      }
      operationFiles.push({
        path: relativePath,
        before: currentBefore,
        after,
        unsafeReason,
      });
    }

    if (!operationFiles.length) {
      return { operationId, mode };
    }

    if (!existing) this.changeSets.unshift(changeSet);
    changeSet.mode = mode;
    changeSet.updatedAt = now;
    changeSet.message = renderVisualDeltaCommitMessage(
      options.workflow.vcs.commitMessageTemplate,
      scopeMessageValues(options),
    );
    const operation: VisualDeltaChangeOperation = {
      id: operationId,
      action: options.action,
      scope: options.scope,
      storyIds: [...(options.storyIds ?? [])],
      createdAt: now,
      success,
      ...(error ? { error } : {}),
    };
    changeSet.operations.push(operation);

    for (const next of operationFiles) {
      const current = changeSet.files.find((file) => file.path === next.path);
      if (current) {
        if (current.afterBlob) {
          this.removeBlob(changeSet.id, current.afterBlob);
        }
        current.afterHash = next.after.hash;
        current.afterBlob = this.writeBlob(
          changeSet.id,
          next.path,
          "after",
          next.after.bytes,
        );
        current.change = fileChange(current.beforeHash, current.afterHash);
        current.binary = isBinary(
          next.after.bytes ?? this.readBlob(changeSet, current, "before"),
          next.path,
        );
        current.image = isImagePath(next.path);
        current.unsafeReason = current.unsafeReason ?? next.unsafeReason;
      } else {
        changeSet.files.push({
          path: next.path,
          change: fileChange(next.before.hash, next.after.hash),
          binary: isBinary(next.after.bytes ?? next.before.bytes, next.path),
          image: isImagePath(next.path),
          beforeHash: next.before.hash,
          afterHash: next.after.hash,
          ...(next.unsafeReason ? { unsafeReason: next.unsafeReason } : {}),
          beforeBlob: this.writeBlob(
            changeSet.id,
            next.path,
            "before",
            next.before.bytes,
          ),
          afterBlob: this.writeBlob(
            changeSet.id,
            next.path,
            "after",
            next.after.bytes,
          ),
        });
      }
    }

    changeSet.files = changeSet.files.filter(
      (file) => file.beforeHash !== file.afterHash,
    );
    changeSet.blockReasons = unique(
      changeSet.files
        .map((file) => file.unsafeReason)
        .filter((reason): reason is string => Boolean(reason)),
    );
    changeSet.state = !success
      ? "failed"
      : changeSet.blockReasons.length
        ? "blocked"
        : "pending";
    changeSet.commitAllowed =
      changeSet.state === "pending" &&
      mode !== "off" &&
      this.allowVcsWrites &&
      Boolean(vcs) &&
      changeSet.files.length > 0;
    this.persist();

    let autoCommit: VisualDeltaChangeSetMutation["autoCommit"];
    let autoCommitError: string | undefined;
    if (mode === "auto" && changeSet.commitAllowed) {
      try {
        const committed = await this.commit(changeSet.id, changeSet.message);
        autoCommit = committed.commit;
      } catch (error) {
        autoCommitError =
          error instanceof Error ? error.message : "Automatic commit failed.";
        changeSet.commitError = autoCommitError;
        this.persist();
      }
    }
    return {
      changeSetId: changeSet.id,
      operationId,
      mode,
      ...(autoCommit ? { autoCommit } : {}),
      ...(autoCommitError ? { autoCommitError } : {}),
      changeSet: this.publicSet(changeSet),
    };
  }

  async commit(
    changeSetId: string,
    message: string,
  ): Promise<VisualDeltaChangeSet> {
    const changeSet = this.changeSets.find((item) => item.id === changeSetId);
    if (!changeSet) throw new Error("Visual Delta change set not found.");
    const trimmed = message.trim();
    if (!trimmed) throw new Error("Commit message must not be empty.");
    if (!this.allowVcsWrites) {
      throw new Error("VCS writes are disabled by the Storybook host.");
    }
    if (changeSet.mode === "off") {
      throw new Error("VCS workflow is off for this change set.");
    }
    if (changeSet.state !== "pending" || !changeSet.commitAllowed) {
      throw new Error(
        changeSet.blockReasons[0] ??
          "This Visual Delta change set is not safe to commit.",
      );
    }
    const vcs = await this.vcs();
    if (!vcs || vcs.kind !== changeSet.vcs) {
      throw new Error("The original Git/Jujutsu repository is unavailable.");
    }
    const currentBaseRevision = await vcs.baseRevision().catch(() => null);
    if (currentBaseRevision !== changeSet.baseRevision) {
      const reason =
        "The repository base revision changed after Visual Delta captured this change.";
      changeSet.blockReasons = unique([...changeSet.blockReasons, reason]);
      changeSet.state = "blocked";
      changeSet.commitAllowed = false;
      this.persist();
      throw new Error(reason);
    }

    for (const file of changeSet.files) {
      const current = snapshot(this.root, file.path);
      if (current.hash !== file.afterHash) {
        file.unsafeReason =
          "The working file changed after Visual Delta captured this change.";
      }
    }
    changeSet.blockReasons = unique(
      changeSet.files
        .map((file) => file.unsafeReason)
        .filter((reason): reason is string => Boolean(reason)),
    );
    if (changeSet.blockReasons.length) {
      changeSet.state = "blocked";
      changeSet.commitAllowed = false;
      this.persist();
      throw new Error(changeSet.blockReasons[0]);
    }

    const paths = changeSet.files.map((file) => file.path);
    const newPaths = changeSet.files
      .filter((file) => file.beforeHash == null && file.afterHash != null)
      .map((file) => file.path);
    let result: { revisionId: string; displayId: string };
    try {
      result = await vcs.commitPaths(paths, trimmed, newPaths);
    } catch (error) {
      changeSet.commitError =
        error instanceof Error ? error.message : "VCS commit failed.";
      this.persist();
      throw error;
    }
    changeSet.state = "committed";
    changeSet.commitAllowed = false;
    changeSet.updatedAt = new Date().toISOString();
    changeSet.message = trimmed;
    delete changeSet.commitError;
    changeSet.commit = {
      vcs: vcs.kind,
      revisionId: result.revisionId,
      displayId: result.displayId || displayId(result.revisionId),
      message: trimmed,
      committedAt: changeSet.updatedAt,
    };
    this.persist();
    return this.publicSet(changeSet);
  }
}
