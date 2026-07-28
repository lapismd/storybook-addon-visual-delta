import { useCallback, useEffect, useMemo, useState } from "react";
import { FORCE_REMOUNT } from "storybook/internal/core-events";
import {
  EVENTS as INSTRUMENTER_EVENTS,
  type Call,
  type SyncPayload,
} from "storybook/internal/instrumenter";
import { addons, useAddonState } from "storybook/manager-api";
import { EVENTS, type VisualDeltaInteraction } from "../constants.js";
import {
  interactionIdForInstrumenterCall,
  slugifyStepLabel,
} from "../shared/interaction-capture.js";

export type PlayStepInfo = {
  /** Instrumenter call id when known; empty for CSF-only / preview-emitted rows. */
  callId: string;
  label: string;
  /** Resolved Storybook-style call used for the syntax-highlighted row title. */
  syntax?: InteractionCallSyntax;
  stepId: string;
  status?: Call["status"];
  /** True when sourced from `parameters.visualDelta.interactions`. */
  fromCsf?: boolean;
  /** Exact deterministic Storybook call replayed for ordinary interactions. */
  captureCallId?: string;
};

export type InteractionCallTokenKind =
  | "base"
  | "boolean"
  | "method"
  | "meta"
  | "nullish"
  | "number"
  | "string"
  | "tag"
  | "tag-suffix";

export type InteractionCallToken = {
  kind: InteractionCallTokenKind;
  text: string;
};

export type InteractionCallSyntax = {
  text: string;
  tokens: InteractionCallToken[];
};

type PlayStepsPayload = {
  storyId: string;
  steps: Array<{ label: string; stepId: string }>;
};

type StorybookInteractionsAddonState = {
  interactions?: Call[];
};

const STORYBOOK_INTERACTIONS_ADDON_ID = "storybook/interactions";

/**
 * Merge CSF-wired interactions with live-discovered play steps.
 * Prefer rows that have a callId (GOTO works); always keep CSF labels/ids.
 */
export function mergeInteractionRows(
  playSteps: PlayStepInfo[],
  interactions: VisualDeltaInteraction[],
): PlayStepInfo[] {
  const byId = new Map<string, PlayStepInfo>();

  for (const item of interactions) {
    const stepId = item.id.trim();
    if (!stepId) continue;
    byId.set(stepId, {
      callId: "",
      label: item.label || stepId,
      stepId,
      fromCsf: true,
    });
  }

  for (const step of playSteps) {
    const prev = byId.get(step.stepId);
    byId.set(step.stepId, {
      callId: step.callId || prev?.callId || "",
      label: step.label || prev?.label || step.stepId,
      stepId: step.stepId,
      status: step.status,
      fromCsf: prev?.fromCsf,
      captureCallId: step.captureCallId ?? prev?.captureCallId,
      syntax: step.syntax ?? prev?.syntax,
    });
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Recover calls retained by Storybook's Interactions addon before this panel mounted. */
export function instrumenterStepsFromCalls(
  calls: readonly Call[],
  storyId: string,
): PlayStepInfo[] {
  const callsById = new Map(calls.map((call) => [call.id, call]));
  const seen = new Set<string>();
  const out: PlayStepInfo[] = [];
  for (const call of calls) {
    if (call.storyId !== storyId) continue;
    if (!call.interceptable || call.ancestors.length > 0) continue;
    const namedStep = call.method === "step";
    const label = namedStep
      ? String(call.args?.[0] ?? "").trim()
      : instrumenterCallLabel(call);
    if (!label) continue;
    const stepId = namedStep
      ? slugifyStepLabel(label)
      : interactionIdForInstrumenterCall(call.cursor, call.method);
    if (!stepId || seen.has(stepId)) continue;
    seen.add(stepId);
    out.push({
      callId: call.id,
      label,
      syntax: instrumenterCallSyntax(call, callsById),
      stepId,
      status: call.status,
      captureCallId: namedStep ? undefined : call.id,
    });
  }
  return out;
}

/**
 * Collect named play steps for the Interactions tab.
 *
 * Sources:
 * 1. Preview `runStep` → `EVENTS.PLAY_STEPS` (reliable)
 * 2. Storybook instrumenter CALL/SYNC (optional callId for GOTO)
 *
 * CSF `visualDelta.interactions` are merged by the panel via
 * `mergeInteractionRows`.
 */
export function usePlaySteps(storyId: string | undefined): {
  steps: PlayStepInfo[];
  /** Interaction row most recently selected in Storybook's Interactions tab. */
  selectedStepId: string | null;
  clear: () => void;
} {
  const [previewSteps, setPreviewSteps] = useState<PlayStepInfo[]>([]);
  const [callsById, setCallsById] = useState<Map<string, Call>>(
    () => new Map(),
  );
  const [logItems, setLogItems] = useState<SyncPayload["logItems"]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [storybookInteractionsState] =
    useAddonState<StorybookInteractionsAddonState>(
      STORYBOOK_INTERACTIONS_ADDON_ID,
    );

  useEffect(() => {
    setPreviewSteps([]);
    setCallsById(new Map());
    setLogItems([]);
    setSelectedCallId(null);
  }, [storyId]);

  useEffect(() => {
    if (!storyId) return;
    const channel = addons.getChannel();

    const onPlaySteps = (payload: PlayStepsPayload) => {
      if (payload.storyId !== storyId) return;
      setPreviewSteps(
        (payload.steps ?? []).map((step) => ({
          callId: "",
          label: step.label,
          stepId: step.stepId || slugifyStepLabel(step.label),
        })),
      );
    };

    const onCall = (call: Call) => {
      if (call.storyId !== storyId) return;
      setCallsById((prev) => {
        const next = new Map(prev);
        next.set(call.id, call);
        return next;
      });
    };

    const onSync = (payload: SyncPayload) => {
      setLogItems(payload.logItems ?? []);
    };
    const onGoto = (payload: { storyId?: string; callId?: string }) => {
      if (payload.storyId !== storyId || !payload.callId) return;
      setSelectedCallId(payload.callId);
    };

    channel.on(EVENTS.PLAY_STEPS, onPlaySteps);
    channel.on(INSTRUMENTER_EVENTS.CALL, onCall);
    channel.on(INSTRUMENTER_EVENTS.SYNC, onSync);
    channel.on(INSTRUMENTER_EVENTS.GOTO, onGoto);
    return () => {
      channel.off(EVENTS.PLAY_STEPS, onPlaySteps);
      channel.off(INSTRUMENTER_EVENTS.CALL, onCall);
      channel.off(INSTRUMENTER_EVENTS.SYNC, onSync);
      channel.off(INSTRUMENTER_EVENTS.GOTO, onGoto);
    };
  }, [storyId]);

  const instrumenterSteps = useMemo(() => {
    if (!storyId) return [] as PlayStepInfo[];
    const orderedCalls = logItems.flatMap((item) => {
      const call = callsById.get(item.callId);
      return call
        ? [
            {
              ...call,
              status: call.status ?? item.status,
            } as Call,
          ]
        : [];
    });
    return instrumenterStepsFromCalls(orderedCalls, storyId);
  }, [callsById, logItems, storyId]);

  const retainedInstrumenterSteps = useMemo(
    () =>
      storyId
        ? instrumenterStepsFromCalls(
            storybookInteractionsState?.interactions ?? [],
            storyId,
          )
        : [],
    [storybookInteractionsState?.interactions, storyId],
  );

  const steps = useMemo(
    () =>
      mergeInteractionRows(
        [...previewSteps, ...retainedInstrumenterSteps, ...instrumenterSteps],
        [],
      ),
    [instrumenterSteps, previewSteps, retainedInstrumenterSteps],
  );
  const selectedStepId = useMemo(
    () => steps.find((step) => step.callId === selectedCallId)?.stepId ?? null,
    [selectedCallId, steps],
  );

  // Keep a sync lookup for GOTO even when React merge state is briefly stale.
  useEffect(() => {
    if (!storyId) return;
    for (const step of steps) {
      if (!step.callId || !step.stepId) continue;
      callIdByStoryStep.set(`${storyId}::${step.stepId}`, step.callId);
    }
  }, [steps, storyId]);

  const clear = useCallback(() => {
    setPreviewSteps([]);
    setCallsById(new Map());
    setLogItems([]);
    setSelectedCallId(null);
  }, []);

  return { steps, selectedStepId, clear };
}

const callIdByStoryStep = new Map<string, string>();

/** Compact human label matching the source used by Storybook Interactions. */
export function instrumenterCallLabel(
  call: Pick<Call, "args" | "method" | "path">,
) {
  const path = call.path.filter(
    (part): part is string =>
      typeof part === "string" && part.trim().length > 0,
  );
  const prefix = path.join(".");
  const base = prefix ? `${prefix}.${call.method}` : call.method;
  const argumentsLabel = call.args
    .filter(
      (argument): argument is string | number | boolean =>
        typeof argument === "string" ||
        typeof argument === "number" ||
        typeof argument === "boolean",
    )
    .slice(0, 2)
    .map((argument) => JSON.stringify(argument))
    .join(", ");
  return argumentsLabel ? `${base}(${argumentsLabel})` : base;
}

function syntaxToken(
  kind: InteractionCallTokenKind,
  text: string,
): InteractionCallToken {
  return { kind, text };
}

function valueSyntax(
  value: unknown,
  callsById: ReadonlyMap<string, Call>,
  visited: ReadonlySet<string>,
): InteractionCallToken[] {
  if (value === null) return [syntaxToken("nullish", "null")];
  if (value === undefined) return [syntaxToken("nullish", "undefined")];
  if (typeof value === "string") {
    return [syntaxToken("string", JSON.stringify(value))];
  }
  if (typeof value === "number") {
    return [syntaxToken("number", String(value))];
  }
  if (typeof value === "boolean") {
    return [syntaxToken("boolean", String(value))];
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 3)
      .flatMap((item, index) => [
        ...(index > 0 ? [syntaxToken("base", ", ")] : []),
        ...valueSyntax(item, callsById, visited),
      ]);
    return [
      syntaxToken("base", "["),
      ...items,
      ...(value.length > 3 ? [syntaxToken("base", ", …")] : []),
      syntaxToken("base", "]"),
    ];
  }
  if (typeof value !== "object") {
    return [syntaxToken("meta", String(value))];
  }

  const record = value as Record<string, unknown>;
  if (typeof record.__callId__ === "string") {
    const referenced = callsById.get(record.__callId__);
    if (referenced) return callSyntaxTokens(referenced, callsById, visited);
  }
  if (record.__element__ && typeof record.__element__ === "object") {
    const element = record.__element__ as {
      prefix?: string;
      localName?: string;
      id?: string;
      classNames?: string[];
      innerText?: string;
    };
    const tagName = [element.prefix, element.localName]
      .filter(Boolean)
      .join(":");
    const suffix = element.id
      ? `#${element.id}`
      : (element.classNames ?? []).map((name) => `.${name}`).join("");
    return [
      syntaxToken("base", "<"),
      syntaxToken("tag", tagName || "element"),
      ...(suffix ? [syntaxToken("tag-suffix", suffix)] : []),
      syntaxToken("base", ">"),
    ];
  }
  if (record.__class__ && typeof record.__class__ === "object") {
    const name = (record.__class__ as { name?: unknown }).name;
    return [syntaxToken("meta", typeof name === "string" ? name : "Object")];
  }
  if (record.__function__ && typeof record.__function__ === "object") {
    const name = (record.__function__ as { name?: unknown }).name;
    return [syntaxToken("meta", typeof name === "string" ? name : "anonymous")];
  }
  if (record.__regexp__ && typeof record.__regexp__ === "object") {
    const regexp = record.__regexp__ as {
      flags?: unknown;
      source?: unknown;
    };
    return [
      syntaxToken(
        "meta",
        `/${String(regexp.source ?? "")}/${String(regexp.flags ?? "")}`,
      ),
    ];
  }
  return [syntaxToken("base", "{…}")];
}

function callSyntaxTokens(
  call: Pick<Call, "args" | "id" | "method" | "path">,
  callsById: ReadonlyMap<string, Call>,
  visited: ReadonlySet<string>,
): InteractionCallToken[] {
  if (visited.has(call.id)) return [syntaxToken("meta", call.method)];
  const nextVisited = new Set(visited);
  nextVisited.add(call.id);

  if (
    call.method === "step" &&
    call.path.length === 0 &&
    typeof call.args[0] === "string"
  ) {
    return [syntaxToken("base", call.args[0])];
  }

  const path = call.path.flatMap((part) => [
    ...(typeof part === "string"
      ? [syntaxToken("base", part)]
      : valueSyntax(part, callsById, nextVisited)),
    syntaxToken("base", "."),
  ]);
  const args = call.args.flatMap((argument, index) => [
    ...(index > 0 ? [syntaxToken("base", ", ")] : []),
    ...valueSyntax(argument, callsById, nextVisited),
  ]);
  return [
    ...path,
    syntaxToken("method", call.method),
    syntaxToken("base", "("),
    ...args,
    syntaxToken("base", ")"),
  ];
}

/** Resolve nested Storybook call references into its final displayed syntax. */
export function instrumenterCallSyntax(
  call: Pick<Call, "args" | "id" | "method" | "path">,
  callsById: ReadonlyMap<string, Call>,
): InteractionCallSyntax {
  const tokens = callSyntaxTokens(call, callsById, new Set());
  return {
    text: tokens.map((token) => token.text).join(""),
    tokens,
  };
}

/** Look up an instrumenter call id for GOTO after play has run. */
export function lookupPlayStepCallId(
  storyId: string,
  stepId: string,
): string | null {
  return callIdByStoryStep.get(`${storyId}::${stepId}`) ?? null;
}

/** Remount and run play through the given instrumenter call (inclusive). */
export function gotoPlayStep(storyId: string, callId: string) {
  const channel = addons.getChannel();
  channel.emit(INSTRUMENTER_EVENTS.GOTO, { storyId, callId });
}

/**
 * Remount and park play after `stepId` via preview sessionStorage + runStep.
 * Playwright create uses URL park instead; live panel prefers GOTO.
 */
export function runUntilStep(storyId: string, stepId: string) {
  const channel = addons.getChannel();
  channel.emit(EVENTS.RUN_UNTIL_STEP, { storyId, stepId });
  channel.emit(FORCE_REMOUNT, { storyId });
}

/** Set/clear the preview session park without remounting. */
export function setPlayParkTarget(storyId: string, stepId: string | null) {
  const channel = addons.getChannel();
  channel.emit(EVENTS.RUN_UNTIL_STEP, { storyId, stepId });
}

/** Remount the story without parking (refresh instrumenter callIds). */
export function remountStory(storyId: string) {
  const channel = addons.getChannel();
  channel.emit(EVENTS.RUN_UNTIL_STEP, { storyId, stepId: null });
  channel.emit(FORCE_REMOUNT, { storyId });
}

/** Clear park flag and run play to completion. */
export function endPlayDebug(storyId: string) {
  const channel = addons.getChannel();
  channel.emit(EVENTS.RUN_UNTIL_STEP, { storyId, stepId: null });
  channel.emit(INSTRUMENTER_EVENTS.END, { storyId });
}
