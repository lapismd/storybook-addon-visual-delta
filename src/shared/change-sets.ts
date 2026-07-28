import {
  VISUAL_DELTA_CHANGE_SET_COMMIT_PATH,
  VISUAL_DELTA_CHANGE_SET_FILE_PATH,
  VISUAL_DELTA_CHANGE_SETS_PATH,
} from "../constants.js";

export type VisualDeltaChangeAction =
  | "auto-accept"
  | "baseline-create"
  | "baseline-update"
  | "baseline-delete"
  | "interaction-create"
  | "interaction-update"
  | "review-status"
  | "status-batch"
  | "skip-visual"
  | "story-config"
  | "project-config"
  | "playwright-threshold"
  | "init";

export type VisualDeltaChangeSetState =
  | "pending"
  | "blocked"
  | "failed"
  | "committed";

export type VisualDeltaChangeFile = {
  path: string;
  change: "added" | "modified" | "deleted";
  binary: boolean;
  image: boolean;
  beforeHash: string | null;
  afterHash: string | null;
  unsafeReason?: string;
  beforeUrl?: string;
  afterUrl?: string;
};

export type VisualDeltaChangeOperation = {
  id: string;
  action: VisualDeltaChangeAction;
  scope: string;
  storyIds: string[];
  createdAt: string;
  success: boolean;
  error?: string;
};

export type VisualDeltaChangeCommit = {
  vcs: "jj" | "git";
  revisionId: string;
  displayId: string;
  message: string;
  committedAt: string;
};

export type VisualDeltaChangeSet = {
  id: string;
  state: VisualDeltaChangeSetState;
  createdAt: string;
  updatedAt: string;
  baseRevision: string | null;
  vcs: "jj" | "git" | null;
  mode: "off" | "review" | "auto";
  message: string;
  operations: VisualDeltaChangeOperation[];
  files: VisualDeltaChangeFile[];
  blockReasons: string[];
  commitAllowed: boolean;
  commitError?: string;
  commit?: VisualDeltaChangeCommit;
};

export type VisualDeltaChangeSetsResponse = {
  ok: true;
  pendingCount: number;
  changeSets: VisualDeltaChangeSet[];
};

export type VisualDeltaChangeSetMutation = {
  changeSetId?: string;
  operationId?: string;
  mode?: "off" | "review" | "auto";
  autoCommit?: VisualDeltaChangeCommit;
  autoCommitError?: string;
  changeSet?: VisualDeltaChangeSet;
};

export type VisualDeltaChangeSetCommitResponse =
  | { ok: true; changeSet: VisualDeltaChangeSet }
  | { ok: false; error: string; changeSet?: VisualDeltaChangeSet };

export function visualDeltaChangeSetFileUrl(args: {
  changeSetId: string;
  path: string;
  phase: "before" | "after";
}): string {
  const query = new URLSearchParams({
    changeSetId: args.changeSetId,
    path: args.path,
    phase: args.phase,
  });
  return `${VISUAL_DELTA_CHANGE_SET_FILE_PATH}?${query}`;
}

export async function fetchVisualDeltaChangeSets(
  signal?: AbortSignal,
): Promise<VisualDeltaChangeSetsResponse> {
  const response = await fetch(VISUAL_DELTA_CHANGE_SETS_PATH, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | VisualDeltaChangeSetsResponse
    | { error?: string }
    | null;
  if (!response.ok || !payload || !("changeSets" in payload)) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : `Change sets failed (${response.status})`,
    );
  }
  return payload;
}

export async function commitVisualDeltaChangeSet(args: {
  changeSetId: string;
  message: string;
}): Promise<VisualDeltaChangeSet> {
  const response = await fetch(VISUAL_DELTA_CHANGE_SET_COMMIT_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as VisualDeltaChangeSetCommitResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && !payload.ok
        ? payload.error
        : `Change-set commit failed (${response.status})`,
    );
  }
  return payload.changeSet;
}
