import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import {
  VISUAL_DELTA_CANCEL_PATH,
  VISUAL_DELTA_CAPTURE_PATH,
  VISUAL_DELTA_CONFIG_PATH,
  VISUAL_DELTA_CREATE_INTERACTION_PATH,
  VISUAL_DELTA_CREATE_PATH,
  VISUAL_DELTA_INIT_PATH,
  VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH,
  VISUAL_DELTA_REVIEW_PATH,
  VISUAL_DELTA_RUN_PATH,
  VISUAL_DELTA_SKIP_VISUAL_PATH,
  VISUAL_DELTA_UPDATE_PATH,
  isVisualReviewStatus,
  type VisualReviewStatus,
} from "../constants.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import {
  captureSubjectWithChromium,
  type CaptureSubjectRequest,
} from "./capture-subject.js";
import type { CaptureSubjectStreamEvent } from "../shared/capture-subject-types.js";
import {
  DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
  DEFAULT_VISUAL_SERVER_PORT,
  DEFAULT_VISUAL_TEST_ARGS,
  DEFAULT_VISUAL_UPDATE_ARGS,
  resolveBaselinePathMode,
  resolveRoot,
  resolveSnapshotDir,
  type VisualDeltaHostOptions,
} from "./options.js";
import type { StoryIndexEntry } from "./snapshot-paths.js";
import {
  patchStorySkipVisual,
  patchStoryVisualReviewStatus,
} from "./story-source.js";
import { loadSidecarForStoryId } from "./visual-sidecars.js";
import {
  inspectVisualDeltaOnboarding,
  runVisualDeltaInit,
} from "./init-scaffold.js";
import {
  readPlaywrightPassThresholdPercent,
  writePlaywrightPassThresholdPercent,
} from "./playwright-threshold.js";
import {
  ensurePlaywrightWebServerPort,
  ensureWarmStaticStorybookServer,
} from "./visual-server.js";

type UpdateBody = {
  storyId?: string;
  component?: string;
};

type InteractionUpdateBody = {
  storyId?: string;
  /** Human step label from `step("…")`. */
  stepLabel?: string;
  /** Optional pre-slugified id; defaults to slugify(stepLabel). */
  stepId?: string;
  /** Overwrite an existing interaction PNG. */
  overwrite?: boolean;
};

type SpawnedVisualCommand = ChildProcess & {
  on: {
    (
      event: "error",
      listener: (error: Error) => void,
    ): SpawnedVisualCommand;
    (
      event: "close",
      listener: (code: number | null) => void,
    ): SpawnedVisualCommand;
  };
};

type RunBody = {
  /** Limit Playwright `-g` to these story ids (or their shared prefix). */
  storyIds?: string[];
  /** Rebuild storybook-static before running (slow but picks up live edits). */
  rebuild?: boolean;
};

export type VisualRunResultItem = {
  storyId: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  title: string;
  error?: string;
  /** Ephemeral metrics written next to the baseline PNG during the run. */
  sidecar?: VisualDiffSidecar;
};

export type VisualRunResponse = {
  ok: boolean;
  exitCode: number;
  crashed?: boolean;
  error?: string;
  rebuild: boolean;
  grep?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: VisualRunResultItem[];
  logTail: string;
};

/** NDJSON events streamed while `/__visual-delta/run-tests` is in progress. */
export type VisualRunStreamEvent =
  | { type: "start"; total: number }
  | {
      type: "progress";
      completed: number;
      total: number;
      passed: number;
      failed: number;
      storyId: string;
      status: "passed" | "failed";
    }
  | { type: "log"; line: string }
  | ({ type: "done" } & VisualRunResponse)
  | { type: "error"; error: string; crashed?: boolean };

let activeRun: ChildProcess | null = null;

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (chunks.reduce((n, c) => n + c.length, 0) > 64_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a Playwright `-g` filter from selected story ids.
 *
 * Playwright matches against the *full* title
 * (`… › ${storyId}`), so patterns must not use a leading `^` — only a
 * trailing `$` for exact leaf ids.
 */
export function grepFromStoryIds(storyIds?: string[]): string | undefined {
  if (!storyIds?.length) return undefined;
  if (storyIds.length === 1) {
    return `${escapeRegExp(storyIds[0]!)}$`;
  }

  const heads = storyIds.map((id) => id.split("--")[0] ?? id);
  if (new Set(heads).size === 1) {
    return `${escapeRegExp(heads[0]!)}--`;
  }

  return `(${storyIds.map(escapeRegExp).join("|")})$`;
}

type PlaywrightJsonSpec = {
  title?: string;
  ok?: boolean;
  tests?: Array<{
    status?: string;
    results?: Array<{ status?: string; error?: { message?: string } }>;
  }>;
  suites?: PlaywrightJsonSuite[];
};

type PlaywrightJsonSuite = {
  title?: string;
  specs?: PlaywrightJsonSpec[];
  suites?: PlaywrightJsonSuite[];
};

function walkSpecs(
  suite: PlaywrightJsonSuite,
  out: VisualRunResultItem[],
): void {
  for (const spec of suite.specs ?? []) {
    const storyId = spec.title?.trim();
    if (!storyId) continue;
    const test = spec.tests?.[0];
    const result = test?.results?.[0];
    const raw =
      result?.status ?? test?.status ?? (spec.ok ? "passed" : "failed");
    let status: VisualRunResultItem["status"] = "failed";
    if (raw === "passed" || raw === "expected" || spec.ok === true) {
      status = "passed";
    } else if (raw === "skipped" || raw === "pending") {
      status = "skipped";
    } else if (raw === "timedOut") {
      status = "timedOut";
    }
    out.push({
      storyId,
      status,
      title: storyId,
      error: result?.error?.message,
    });
  }
  for (const child of suite.suites ?? []) {
    walkSpecs(child, out);
  }
}

function parsePlaywrightJson(raw: string): VisualRunResultItem[] {
  const report = JSON.parse(raw) as { suites?: PlaywrightJsonSuite[] };
  const results: VisualRunResultItem[] = [];
  for (const suite of report.suites ?? []) {
    walkSpecs(suite, results);
  }
  return results;
}

/** Attach on-disk JSON sidecars produced by the visual suite. */
export function attachSidecars(
  results: VisualRunResultItem[],
  packageRoot: string,
  options: VisualDeltaHostOptions = {},
): VisualRunResultItem[] {
  const snapshotDir = resolveSnapshotDir(options, packageRoot);
  const mode = resolveBaselinePathMode(options);
  return results.map((item) => {
    const sidecar = loadSidecarForStoryId(
      item.storyId,
      packageRoot,
      snapshotDir,
      mode,
    );
    return sidecar ? { ...item, sidecar } : item;
  });
}

function extractJsonDocument(log: string): string | null {
  const start = log.indexOf("{");
  const end = log.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return log.slice(start, end + 1);
}

function summarize(results: VisualRunResultItem[]) {
  const summary = { total: results.length, passed: 0, failed: 0, skipped: 0 };
  for (const item of results) {
    if (item.status === "passed") summary.passed++;
    else if (item.status === "skipped") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

export function visualTestCommandArgs(
  options: VisualDeltaHostOptions = {},
  grep?: string,
): string[] {
  // List-only: pairing `--reporter=json` on stdout suppresses list lines (or
  // downgrades to line reporter), so the Testing Module stays at 0/N until done.
  return [
    ...(options.visualTestArgs ?? [...DEFAULT_VISUAL_TEST_ARGS]),
    "--reporter=list",
    ...(grep ? ["-g", grep] : []),
  ];
}

/**
 * Count visual stories in storybook-static.
 * When `storyIds` is provided, count exact membership (not a regex filter) so
 * story/component progress totals match the scoped run.
 */
export function countVisualStories(root: string, storyIds?: string[]): number {
  const indexPath = path.join(root, "storybook-static", "index.json");
  if (!existsSync(indexPath)) {
    // Fall back to the requested scope size when the static index is absent.
    return storyIds?.length ?? 0;
  }
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      entries?: Record<string, StoryIndexEntry>;
    };
    const stories = Object.values(index.entries ?? {}).filter(
      (e) => e.type === "story" && !(e.tags ?? []).includes("skip-visual"),
    );
    if (storyIds?.length) {
      const wanted = new Set(storyIds);
      return stories.filter((e) => wanted.has(e.id)).length;
    }
    return stories.length;
  } catch {
    return storyIds?.length ?? 0;
  }
}

/** Strip ANSI color codes so list-reporter lines parse reliably. */
export function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*[mK]/g, "");
}

/**
 * Playwright list-reporter line, e.g.
 * `  ✓   1 [chromium] › … › shadcn-button--default (823ms)`
 */
export function parseListReporterProgress(
  chunk: string,
): Array<{ index: number; storyId: string; status: "passed" | "failed" }> {
  const out: Array<{
    index: number;
    storyId: string;
    status: "passed" | "failed";
  }> = [];
  const text = stripAnsi(chunk);
  const re =
    /([✓✔✘×xX])\s+(\d+)\s+.*?›\s+(\S+--\S+?)(?:\s+\([\d.]+\s*[mun]?s\))?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const mark = match[1] ?? "";
    const index = Number(match[2]);
    const storyId = match[3]?.trim();
    if (!storyId || !Number.isFinite(index)) continue;
    const failed = mark === "✘" || mark === "×" || mark === "x" || mark === "X";
    out.push({
      index,
      storyId,
      status: failed ? "failed" : "passed",
    });
  }
  return out;
}

function writeNdjson(res: ServerResponse, event: VisualRunStreamEvent) {
  res.write(`${JSON.stringify(event)}\n`);
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  onChunk?: (text: string) => void,
): Promise<{ code: number; log: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    }) as SpawnedVisualCommand;
    activeRun = child;
    let log = "";
    const append = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      log += text;
      if (log.length > 200_000) {
        log = log.slice(-160_000);
      }
      onChunk?.(text);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error: Error) => {
      if (activeRun === child) activeRun = null;
      reject(error);
    });
    child.on("close", (code: number | null) => {
      if (activeRun === child) activeRun = null;
      resolve({ code: code ?? 1, log });
    });
  });
}

async function handleBaselineWrite(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  mode: "update" | "create",
  options: VisualDeltaHostOptions,
) {
  let body: UpdateBody;
  try {
    body = await readJsonBody<UpdateBody>(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : "Invalid JSON");
    return;
  }

  const storyId = body.storyId?.trim();
  const component = body.component?.trim();
  if (!storyId && !component) {
    res.statusCode = 400;
    res.end("Provide storyId or component");
    return;
  }

  const createOnly = mode === "create";
  const baseArgs = options.visualUpdateArgs ?? [...DEFAULT_VISUAL_UPDATE_ARGS];
  const args = [
    ...baseArgs,
    ...(createOnly ? ["--create-only"] : []),
    ...(component ? ["--component", component] : ["--story-id", storyId!]),
  ];

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint proxies / browsers not to buffer the streamed body.
  res.setHeader("X-Accel-Buffering", "no");
  const verb = createOnly ? "Creating missing baselines" : "Updating baselines";
  res.write(`${verb}${component ? ` for ${component}` : ` for ${storyId}`}…\n`);

  try {
    const { code } = await runCommand(
      "pnpm",
      args,
      root,
      { VISUAL_UPDATE_APPROVED: "1" },
      (chunk) => {
        res.write(chunk);
      },
    );
    res.write(`\n[exit ${code}]\n`);
  } catch (error) {
    res.write(
      `\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  res.end();
}

async function handleInteractionBaselineWrite(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
) {
  let body: InteractionUpdateBody;
  try {
    body = await readJsonBody<InteractionUpdateBody>(req);
  } catch (error) {
    res.statusCode = 400;
    res.end(error instanceof Error ? error.message : "Invalid JSON");
    return;
  }

  const storyId = body.storyId?.trim();
  const stepLabel = body.stepLabel?.trim();
  const stepId = body.stepId?.trim();
  if (!storyId || !stepLabel) {
    res.statusCode = 400;
    res.end("Provide storyId and stepLabel");
    return;
  }

  const baseArgs = options.visualInteractionUpdateArgs ?? [
    ...DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
  ];
  const args = [
    ...baseArgs,
    ...(body.overwrite ? [] : ["--create-only"]),
    "--story-id",
    storyId,
    "--step-label",
    stepLabel,
    ...(stepId ? ["--step-id", stepId] : []),
  ];

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Accel-Buffering", "no");
  res.write(
    `${body.overwrite ? "Updating" : "Creating"} interaction baseline "${stepLabel}" for ${storyId}…\n`,
  );

  try {
    const { code } = await runCommand(
      "pnpm",
      args,
      root,
      { VISUAL_UPDATE_APPROVED: "1" },
      (chunk) => {
        res.write(chunk);
      },
    );
    res.write(`\n[exit ${code}]\n`);
  } catch (error) {
    res.write(
      `\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  res.end();
}

function beginNdjson(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint proxies / browsers not to buffer the streamed body.
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

async function handleRun(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
) {
  if (activeRun) {
    writeJson(res, 409, {
      ok: false,
      crashed: true,
      error: "A visual test run is already in progress",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }

  let body: RunBody;
  try {
    body = await readJsonBody<RunBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error: error instanceof Error ? error.message : "Invalid JSON",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }

  // Scoped runs must never broaden to the full suite when the selection is empty.
  if (Array.isArray(body.storyIds) && body.storyIds.length === 0) {
    writeJson(res, 400, {
      ok: false,
      crashed: true,
      error:
        "No runnable visual stories in the selected scope (all skip-visual or empty)",
      exitCode: 1,
      rebuild: false,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: "",
    } satisfies VisualRunResponse);
    return;
  }

  const staticIndex = path.join(root, "storybook-static", "index.json");
  const staticIframe = path.join(root, "storybook-static", "iframe.html");
  const staticComplete = existsSync(staticIndex) && existsSync(staticIframe);
  const allowRebuild = options.allowRebuild !== false;
  const rebuild =
    allowRebuild &&
    (Boolean(body.rebuild) || !staticComplete);
  const grep = grepFromStoryIds(body.storyIds);
  let log = "";

  beginNdjson(res);

  try {
    if (rebuild) {
      const rebuildLine = body.rebuild
        ? "Rebuilding storybook-static — explicit rebuild requested"
        : !existsSync(staticIndex)
          ? "Building storybook-static — index.json missing"
          : "Rebuilding storybook-static — incomplete (missing iframe.html)";
      writeNdjson(res, { type: "log", line: rebuildLine });
      log += `${rebuildLine}\n`;
      const built = await runCommand("pnpm", ["build-storybook"], root);
      log += built.log;
      if (built.code !== 0) {
        writeNdjson(res, {
          type: "error",
          error: "build-storybook failed",
          crashed: true,
        });
        writeNdjson(res, {
          type: "done",
          ok: false,
          crashed: true,
          error: "build-storybook failed",
          exitCode: built.code,
          rebuild,
          grep,
          summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
          results: [],
          logTail: log.slice(-4000),
        });
        res.end();
        return;
      }
    } else if (staticComplete) {
      writeNdjson(res, {
        type: "log",
        line: "Using existing storybook-static",
      });
      log += "Using existing storybook-static\n";
    }

    const total = countVisualStories(root, body.storyIds);
    writeNdjson(res, { type: "start", total });

    const seenIndexes = new Set<number>();
    const progressResults: VisualRunResultItem[] = [];
    let completed = 0;
    let passed = 0;
    let failed = 0;
    let lineBuf = "";

    const visualPort = options.visualServerPort ?? DEFAULT_VISUAL_SERVER_PORT;
    const warm = await ensureWarmStaticStorybookServer(root, visualPort);
    if (warm.message) {
      writeNdjson(res, { type: "log", line: warm.message });
      log += `${warm.message}\n`;
    }
    if (!warm.ok) {
      await ensurePlaywrightWebServerPort(visualPort);
    }

    const args = visualTestCommandArgs(options, grep);
    const { code, log: runLog } = await runCommand(
      "pnpm",
      args,
      root,
      { PLAYWRIGHT_UPDATE_SNAPSHOTS: "0" },
      (chunk) => {
        lineBuf += chunk;
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop() ?? "";
        for (const line of lines) {
          for (const item of parseListReporterProgress(`${line}\n`)) {
            if (seenIndexes.has(item.index)) continue;
            seenIndexes.add(item.index);
            completed = seenIndexes.size;
            if (item.status === "passed") passed += 1;
            else failed += 1;
            progressResults.push({
              storyId: item.storyId,
              status: item.status,
              title: item.storyId,
            });
            writeNdjson(res, {
              type: "progress",
              completed,
              total: total || completed,
              passed,
              failed,
              storyId: item.storyId,
              status: item.status,
            });
          }
        }
      },
    );
    log += runLog;

    // Prefer list-reporter results (live progress). Fall back to a JSON document
    // in the log when a host still wires `--reporter=json` without a file sink.
    let results: VisualRunResultItem[] = [];
    if (progressResults.length > 0) {
      results = attachSidecars(progressResults, root, options);
    } else {
      const json = extractJsonDocument(runLog);
      if (json) {
        try {
          results = attachSidecars(parsePlaywrightJson(json), root, options);
        } catch {
          /* leave empty — UI still shows crash/fail via exit code */
        }
      }
    }

    const summary = summarize(results);
    // List-reporter progress is authoritative when result parsing yielded nothing,
    // so the UI does not show "Ran 0 tests".
    if (summary.total === 0 && completed > 0) {
      summary.total = completed;
      summary.passed = passed;
      summary.failed = failed;
    }
    writeNdjson(res, {
      type: "done",
      ok: code === 0 && summary.failed === 0,
      exitCode: code,
      rebuild,
      grep,
      summary,
      results,
      logTail: log.slice(-6000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeNdjson(res, { type: "error", error: message, crashed: true });
    writeNdjson(res, {
      type: "done",
      ok: false,
      crashed: true,
      error: message,
      exitCode: 1,
      rebuild,
      grep,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [],
      logTail: log.slice(-4000),
    });
  }
  res.end();
}

function handleCancel(res: ServerResponse) {
  if (!activeRun) {
    writeJson(res, 200, { ok: true, cancelled: false });
    return;
  }
  activeRun.kill("SIGTERM");
  activeRun = null;
  writeJson(res, 200, { ok: true, cancelled: true });
}

type ReviewBody = {
  storyId?: string;
  status?: VisualReviewStatus;
};

async function handleReviewStatus(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
) {
  let body: ReviewBody;
  try {
    body = await readJsonBody<ReviewBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }

  const storyId = body.storyId?.trim();
  const status = body.status;
  if (!storyId || !isVisualReviewStatus(status)) {
    writeJson(res, 400, {
      ok: false,
      error:
        'Provide storyId and status ("pending" | "approved" | "ready" | "failed")',
    });
    return;
  }

  const result = patchStoryVisualReviewStatus({
    packageRoot: root,
    storyId,
    status,
  });
  writeJson(res, result.ok ? 200 : 400, result);
}

type SkipVisualBody = {
  storyId?: string;
  /** `true` = add skip-visual; `false` = remove it. */
  skip?: boolean;
};

async function handleSkipVisual(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
) {
  let body: SkipVisualBody;
  try {
    body = await readJsonBody<SkipVisualBody>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    return;
  }

  const storyId = body.storyId?.trim();
  if (!storyId || typeof body.skip !== "boolean") {
    writeJson(res, 400, {
      ok: false,
      error: "Provide storyId and skip (boolean)",
    });
    return;
  }

  const result = patchStorySkipVisual({
    packageRoot: root,
    storyId,
    skip: body.skip,
  });
  writeJson(res, result.ok ? 200 : 400, result);
}

function handleConfig(
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
) {
  const snapshotDir = resolveSnapshotDir(options, root);
  const onboardingStatus = inspectVisualDeltaOnboarding(root, snapshotDir);
  const warnings: string[] = [];
  if (!existsSync(snapshotDir)) {
    warnings.push(`snapshotDir does not exist yet: ${snapshotDir}`);
  }
  if (!onboardingStatus.ready) {
    warnings.push(onboardingStatus.hint);
  }
  const staticHint =
    "Preset staticDirs mounts snapshotDir at /visual-baselines (or host maps it).";
  warnings.push(staticHint);
  const payload: VisualDeltaResolvedConfig = {
    ok: true,
    options: {
      root,
      snapshotDir,
      baselinePathMode: resolveBaselinePathMode(options),
      visualServerPort: options.visualServerPort ?? DEFAULT_VISUAL_SERVER_PORT,
      allowRebuild: options.allowRebuild !== false,
      visualUpdateArgs: [
        ...(options.visualUpdateArgs ?? [...DEFAULT_VISUAL_UPDATE_ARGS]),
      ],
      visualInteractionUpdateArgs: [
        ...(options.visualInteractionUpdateArgs ?? [
          ...DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
        ]),
      ],
      visualTestArgs: [
        ...(options.visualTestArgs ?? [...DEFAULT_VISUAL_TEST_ARGS]),
      ],
      addonSrcDir: options.addonSrcDir?.trim() || null,
    },
    playwrightPassThresholdPercent: readPlaywrightPassThresholdPercent(root),
    onboarding: {
      suiteReady: onboardingStatus.suiteReady,
      playwrightConfigReady: onboardingStatus.playwrightConfigReady,
      snapshotDirExists: onboardingStatus.snapshotDirExists,
      ready: onboardingStatus.ready,
      hint: onboardingStatus.hint,
    },
    warnings,
  };
  writeJson(res, 200, payload);
}

async function handlePlaywrightThreshold(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
) {
  let body: { passThresholdPercent?: unknown };
  try {
    body = await readJsonBody(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (
    typeof body.passThresholdPercent !== "number" ||
    !Number.isFinite(body.passThresholdPercent)
  ) {
    writeJson(res, 400, {
      ok: false,
      error: "passThresholdPercent must be a finite number",
    });
    return;
  }
  try {
    const written = writePlaywrightPassThresholdPercent(
      root,
      body.passThresholdPercent,
    );
    writeJson(res, 200, {
      ok: true,
      ...written,
      playwrightPassThresholdPercent: written.passThresholdPercent,
    });
  } catch (error) {
    writeJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleInit(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  options: VisualDeltaHostOptions,
) {
  void req;
  const result = runVisualDeltaInit({
    packageRoot: root,
    port: options.visualServerPort ?? DEFAULT_VISUAL_SERVER_PORT,
    force: false,
  });
  writeJson(res, 200, {
    ...result,
    onboarding: inspectVisualDeltaOnboarding(root, result.snapshotDir),
  });
}

async function handleCaptureSubject(
  req: IncomingMessage,
  res: ServerResponse,
) {
  let body: CaptureSubjectRequest;
  try {
    body = await readJsonBody<CaptureSubjectRequest>(req);
  } catch (error) {
    writeJson(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  beginNdjson(res);
  const write = (event: CaptureSubjectStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
    const flushable = res as ServerResponse & { flush?: () => void };
    flushable.flush?.();
  };

  // Client abort (Diff Stop) closes the request; stop emitting further events.
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
  });

  write({ type: "start", storyId: body.storyId });
  try {
    const result = await captureSubjectWithChromium(body, (progress) => {
      if (!clientClosed) write({ type: "progress", ...progress });
    });
    if (!clientClosed) write({ type: "done", ...result });
  } catch (error) {
    if (!clientClosed) {
      write({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!res.writableEnded) res.end();
}

/**
 * Dev-only Visual Delta endpoints:
 * - POST /__visual-delta/update-baseline — regenerate baselines (overwrite)
 * - POST /__visual-delta/create-baseline — create missing baselines only
 * - POST /__visual-delta/create-interaction-baseline — mid-play step capture
 * - POST /__visual-delta/capture-subject — Playwright Chromium subject PNG
 * - POST /__visual-delta/run-tests — run Playwright visual suite (no updates)
 * - POST /__visual-delta/cancel-tests — stop an in-flight run
 * - POST /__visual-delta/review-status — set visual review tag (pending/approved/ready/failed)
 * - POST /__visual-delta/skip-visual — add or remove skip-visual on a story
 * - GET  /__visual-delta/config — resolved host options (read-only)
 * - POST /__visual-delta/playwright-threshold — write host Playwright pass %
 * - POST /__visual-delta/init — scaffold portable Playwright suite/config
 */
export function visualDeltaMiddlewarePlugin(
  options: VisualDeltaHostOptions = {},
): Plugin {
  return {
    name: "visual-delta-middleware",
    configureServer(server) {
      const root = resolveRoot(options, server.config.root);
      const visualPort = options.visualServerPort ?? DEFAULT_VISUAL_SERVER_PORT;
      // Warm :6007 in the background so Testing Module runs can reuse it.
      void ensureWarmStaticStorybookServer(root, visualPort).catch(() => {
        /* non-fatal — Playwright can still start its own webServer */
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";

        if (url === VISUAL_DELTA_CONFIG_PATH) {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.setHeader("Allow", "GET");
            res.end("Method Not Allowed");
            return;
          }
          handleConfig(res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_PLAYWRIGHT_THRESHOLD_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handlePlaywrightThreshold(req, res, root);
          return;
        }

        if (url === VISUAL_DELTA_INIT_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          handleInit(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_UPDATE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleBaselineWrite(req, res, root, "update", options);
          return;
        }

        if (url === VISUAL_DELTA_CREATE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleBaselineWrite(req, res, root, "create", options);
          return;
        }

        if (url === VISUAL_DELTA_CREATE_INTERACTION_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleInteractionBaselineWrite(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_CAPTURE_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleCaptureSubject(req, res);
          return;
        }

        if (url === VISUAL_DELTA_REVIEW_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleReviewStatus(req, res, root);
          return;
        }

        if (url === VISUAL_DELTA_SKIP_VISUAL_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleSkipVisual(req, res, root);
          return;
        }

        if (url === VISUAL_DELTA_RUN_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          await handleRun(req, res, root, options);
          return;
        }

        if (url === VISUAL_DELTA_CANCEL_PATH) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Allow", "POST");
            res.end("Method Not Allowed");
            return;
          }
          handleCancel(res);
          return;
        }

        next();
      });
    },
  };
}
