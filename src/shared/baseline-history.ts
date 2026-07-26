import {
  VISUAL_DELTA_BASELINE_HISTORY_DIFF_PATH,
  VISUAL_DELTA_BASELINE_HISTORY_IMAGE_PATH,
  VISUAL_DELTA_BASELINE_HISTORY_PATH,
} from "../constants.js";

export type BaselineHistoryVcsKind = "jj" | "git";

export type BaselineHistoryEntry = {
  /** Full immutable commit id. `working-copy` is reserved for local bytes. */
  revisionId: string;
  /** JJ change id or Git commit SHA, shortened for the timeline. */
  displayId: string;
  /** JJ's short commit id; Git does not need a secondary identifier. */
  secondaryId?: string;
  subject: string;
  message: string;
  author: string;
  authoredAt: string;
  source: "working-copy" | "commit";
  imageUrl: string;
};

export type BaselineHistoryResponse = {
  ok: true;
  vcs: BaselineHistoryVcsKind;
  followsRenames: boolean;
  warnings?: string[];
  entries: BaselineHistoryEntry[];
  nextCursor: string | null;
};

export type BaselineHistoryErrorResponse = {
  ok: false;
  error: string;
  unavailable?: boolean;
};

export type BaselineHistoryDiffLine = {
  beforeNumber: number | null;
  afterNumber: number | null;
  before: string | null;
  after: string | null;
  kind: "context" | "changed" | "removed" | "added";
};

export type BaselineHistoryDiffHunk = {
  header: string;
  lines: BaselineHistoryDiffLine[];
};

export type BaselineHistoryDiffFile = {
  beforePath: string;
  afterPath: string;
  hunks: BaselineHistoryDiffHunk[];
};

export type BaselineHistoryDiffResponse = {
  ok: true;
  beforeRevisionId: string;
  afterRevisionId: string;
  files: BaselineHistoryDiffFile[];
  truncated: boolean;
};

export function baselinePathFromPublicUrl(
  source: string | undefined,
): string | null {
  if (!source || source.startsWith("data:")) return null;
  try {
    const parsed = new URL(source, globalThis.location?.origin ?? "http://x");
    const prefix = "/visual-baselines/";
    if (!parsed.pathname.startsWith(prefix)) return null;
    const relative = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return relative && !relative.startsWith("/") ? relative : null;
  } catch {
    return null;
  }
}

export async function fetchBaselineHistory(args: {
  path: string;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<BaselineHistoryResponse> {
  const query = new URLSearchParams({ path: args.path });
  if (args.cursor) query.set("cursor", args.cursor);
  const response = await fetch(
    `${VISUAL_DELTA_BASELINE_HISTORY_PATH}?${query}`,
    {
      cache: "no-store",
      signal: args.signal,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | BaselineHistoryResponse
    | BaselineHistoryErrorResponse
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && !payload.ok
        ? payload.error
        : `Baseline history failed (${response.status})`,
    );
  }
  return payload;
}

export async function fetchBaselineHistoryDiff(args: {
  path: string;
  beforeRevisionId: string;
  afterRevisionId: string;
  componentPath?: string;
  signal?: AbortSignal;
}): Promise<BaselineHistoryDiffResponse> {
  const query = new URLSearchParams({
    path: args.path,
    before: args.beforeRevisionId,
    after: args.afterRevisionId,
  });
  if (args.componentPath) query.set("componentPath", args.componentPath);
  const response = await fetch(
    `${VISUAL_DELTA_BASELINE_HISTORY_DIFF_PATH}?${query}`,
    {
      cache: "no-store",
      signal: args.signal,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | BaselineHistoryDiffResponse
    | BaselineHistoryErrorResponse
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && !payload.ok
        ? payload.error
        : `Baseline component diff failed (${response.status})`,
    );
  }
  return payload;
}

export function baselineHistoryImageUrl(
  path: string,
  revisionId: string,
): string {
  const query = new URLSearchParams({ path, revision: revisionId });
  return `${VISUAL_DELTA_BASELINE_HISTORY_IMAGE_PATH}?${query}`;
}
