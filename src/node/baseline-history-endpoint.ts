import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  VISUAL_DELTA_BASELINE_HISTORY_IMAGE_PATH,
  VISUAL_DELTA_BASELINE_HISTORY_PATH,
} from "../constants.js";
import {
  baselineHistoryImageUrl,
  type BaselineHistoryEntry,
  type BaselineHistoryResponse,
} from "../shared/baseline-history.js";
import type { VisualDeltaHostOptions } from "./options.js";
import { resolveSnapshotDir } from "./options.js";
import {
  detectBaselineHistoryVcs,
  workingFileDiffers,
  type BaselineHistoryVcs,
  type VcsFileRevision,
} from "./baseline-history-vcs.js";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function normalizePath(
  requested: string | null,
  snapshotDir: string,
): { absolute: string; snapshotRelative: string } | null {
  if (!requested || requested.includes("\0") || !requested.endsWith(".png")) {
    return null;
  }
  const normalized = requested.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolute = path.resolve(snapshotDir, normalized);
  const relative = path.relative(snapshotDir, absolute);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return {
    absolute,
    snapshotRelative: relative.split(path.sep).join("/"),
  };
}

function repoRelativePath(
  vcs: BaselineHistoryVcs,
  absolute: string,
): string | null {
  const relative = path.relative(vcs.root, absolute);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { offset?: unknown };
    return typeof parsed.offset === "number" &&
      Number.isSafeInteger(parsed.offset) &&
      parsed.offset >= 0
      ? parsed.offset
      : 0;
  } catch {
    return 0;
  }
}

function committedEntry(
  revision: VcsFileRevision,
  snapshotRelative: string,
): BaselineHistoryEntry {
  return {
    revisionId: revision.revisionId,
    displayId: revision.displayId,
    ...(revision.secondaryId ? { secondaryId: revision.secondaryId } : {}),
    subject: revision.subject,
    message: revision.message,
    author: revision.author,
    authoredAt: revision.authoredAt,
    source: "commit",
    imageUrl: baselineHistoryImageUrl(snapshotRelative, revision.revisionId),
  };
}

export function createBaselineHistoryEndpoint(options: {
  root: string;
  hostOptions?: VisualDeltaHostOptions;
  detectVcs?: (root: string) => Promise<BaselineHistoryVcs | null>;
}) {
  const snapshotDir = resolveSnapshotDir(options.hostOptions, options.root);
  const vcsPromise = (options.detectVcs ?? detectBaselineHistoryVcs)(
    options.root,
  );

  async function resolveRequest(requestUrl: URL): Promise<
    | {
        vcs: BaselineHistoryVcs;
        absolute: string;
        snapshotRelative: string;
        repoRelative: string;
      }
    | { error: string; unavailable?: boolean }
  > {
    const target = normalizePath(
      requestUrl.searchParams.get("path"),
      snapshotDir,
    );
    if (!target) return { error: "Provide a valid baseline PNG path" };
    const vcs = await vcsPromise;
    if (!vcs) {
      return {
        error: "Baseline history requires a Jujutsu or Git checkout",
        unavailable: true,
      };
    }
    const repoRelative = repoRelativePath(vcs, target.absolute);
    if (!repoRelative) {
      return {
        error: "The configured snapshot directory is outside the VCS root",
        unavailable: true,
      };
    }
    return { vcs, ...target, repoRelative };
  }

  async function history(
    req: IncomingMessage,
    res: ServerResponse,
    requestUrl: URL,
  ): Promise<void> {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return;
    }
    const resolved = await resolveRequest(requestUrl);
    if ("error" in resolved) {
      writeJson(res, resolved.unavailable ? 503 : 400, {
        ok: false,
        ...resolved,
      });
      return;
    }
    const offset = decodeCursor(requestUrl.searchParams.get("cursor"));
    const requestedLimit = Number(requestUrl.searchParams.get("limit"));
    const limit =
      Number.isSafeInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(MAX_PAGE_SIZE, requestedLimit)
        : PAGE_SIZE;
    try {
      const page = await resolved.vcs.listFileRevisions(resolved.repoRelative, {
        offset,
        limit,
      });
      const warnings = await resolved.vcs.historyWarnings?.();
      const entries = page.entries.map((entry) =>
        committedEntry(entry, resolved.snapshotRelative),
      );
      if (offset === 0) {
        let latest: Buffer | null = null;
        if (page.entries[0]) {
          try {
            latest = await resolved.vcs.readFileAtRevision(page.entries[0]);
          } catch {
            latest = null;
          }
        }
        try {
          if (await workingFileDiffers(resolved.absolute, latest)) {
            const info = await stat(resolved.absolute);
            entries.unshift({
              revisionId: "working-copy",
              displayId: "Working copy",
              subject: "Uncommitted baseline",
              message: "Current baseline bytes from the working directory.",
              author: "Local workspace",
              authoredAt: info.mtime.toISOString(),
              source: "working-copy",
              imageUrl: `/visual-baselines/${resolved.snapshotRelative}`,
            });
          }
        } catch {
          // A deleted working baseline still retains its committed history.
        }
      }
      writeJson(res, 200, {
        ok: true,
        vcs: resolved.vcs.kind,
        followsRenames: resolved.vcs.followsRenames,
        ...(warnings?.length ? { warnings } : {}),
        entries,
        nextCursor:
          page.nextOffset == null ? null : encodeCursor(page.nextOffset),
      } satisfies BaselineHistoryResponse);
    } catch (error) {
      writeJson(res, 500, {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read baseline history",
      });
    }
  }

  async function image(
    req: IncomingMessage,
    res: ServerResponse,
    requestUrl: URL,
  ): Promise<void> {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return;
    }
    const resolved = await resolveRequest(requestUrl);
    if ("error" in resolved) {
      writeJson(res, resolved.unavailable ? 503 : 400, {
        ok: false,
        ...resolved,
      });
      return;
    }
    const revisionId = requestUrl.searchParams.get("revision") ?? "";
    try {
      const revision = await resolved.vcs.findFileRevision(
        resolved.repoRelative,
        revisionId,
      );
      if (!revision) {
        writeJson(res, 404, {
          ok: false,
          error: "Revision is not in the reachable history for this baseline",
        });
        return;
      }
      const png = await resolved.vcs.readFileAtRevision(revision);
      if (
        png.length < 8 ||
        !png
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ) {
        writeJson(res, 415, {
          ok: false,
          error: "Historical baseline is not a PNG",
        });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(png);
    } catch (error) {
      writeJson(res, 500, {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read historical baseline",
      });
    }
  }

  return {
    async handle(
      req: IncomingMessage,
      res: ServerResponse,
      requestUrl: URL,
    ): Promise<boolean> {
      if (requestUrl.pathname === VISUAL_DELTA_BASELINE_HISTORY_PATH) {
        await history(req, res, requestUrl);
        return true;
      }
      if (requestUrl.pathname === VISUAL_DELTA_BASELINE_HISTORY_IMAGE_PATH) {
        await image(req, res, requestUrl);
        return true;
      }
      return false;
    },
  };
}
