import { useCallback, useEffect, useMemo, useState } from "react";
import { FORCE_REMOUNT } from "storybook/internal/core-events";
import {
  EVENTS as INSTRUMENTER_EVENTS,
  type Call,
  type SyncPayload,
} from "storybook/internal/instrumenter";
import { addons } from "storybook/manager-api";
import { EVENTS, type VisualDeltaInteraction } from "../constants.js";
import { slugifyStepLabel } from "../shared/interaction-capture.js";

export type PlayStepInfo = {
  /** Instrumenter call id when known; empty for CSF-only / preview-emitted rows. */
  callId: string;
  label: string;
  stepId: string;
  status?: Call["status"];
  /** True when sourced from `parameters.visualDelta.interactions`. */
  fromCsf?: boolean;
};

type PlayStepsPayload = {
  storyId: string;
  steps: Array<{ label: string; stepId: string }>;
};

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
    });
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
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
  clear: () => void;
} {
  const [previewSteps, setPreviewSteps] = useState<PlayStepInfo[]>([]);
  const [callsById, setCallsById] = useState<Map<string, Call>>(
    () => new Map(),
  );
  const [logItems, setLogItems] = useState<SyncPayload["logItems"]>([]);

  useEffect(() => {
    setPreviewSteps([]);
    setCallsById(new Map());
    setLogItems([]);
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

    channel.on(EVENTS.PLAY_STEPS, onPlaySteps);
    channel.on(INSTRUMENTER_EVENTS.CALL, onCall);
    channel.on(INSTRUMENTER_EVENTS.SYNC, onSync);
    return () => {
      channel.off(EVENTS.PLAY_STEPS, onPlaySteps);
      channel.off(INSTRUMENTER_EVENTS.CALL, onCall);
      channel.off(INSTRUMENTER_EVENTS.SYNC, onSync);
    };
  }, [storyId]);

  const instrumenterSteps = useMemo(() => {
    if (!storyId) return [] as PlayStepInfo[];
    const seen = new Set<string>();
    const out: PlayStepInfo[] = [];
    for (const item of logItems) {
      const call = callsById.get(item.callId);
      if (!call) continue;
      if (call.storyId !== storyId) continue;
      if (call.method !== "step") continue;
      const label = String(call.args?.[0] ?? "").trim();
      if (!label) continue;
      const stepId = slugifyStepLabel(label);
      if (!stepId || seen.has(stepId)) continue;
      seen.add(stepId);
      out.push({
        callId: call.id,
        label,
        stepId,
        status: call.status ?? item.status,
      });
    }
    return out;
  }, [callsById, logItems, storyId]);

  const steps = useMemo(
    () => mergeInteractionRows([...previewSteps, ...instrumenterSteps], []),
    [instrumenterSteps, previewSteps],
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
  }, []);

  return { steps, clear };
}

const callIdByStoryStep = new Map<string, string>();

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
