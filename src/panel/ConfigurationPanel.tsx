import React, { useEffect, useMemo, useState } from "react";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  VISUAL_DELTA_CONFIG_PATH,
  type VisualDeltaParams,
} from "../constants.js";
import { putVisualStoryConfig } from "../manager/run-visual.js";
import type {
  VisualDeltaConfigDiagnostic,
  VisualDeltaProjectDefaults,
  VisualDeltaResolvedConfig,
  VisualDeltaWorkflowConfig,
} from "../shared/config-types.js";
import {
  BUILTIN_VISUAL_DELTA_DEFAULTS,
  validateVisualDeltaProjectDefaults,
} from "../shared/project-defaults.js";
import {
  BUILTIN_VISUAL_DELTA_WORKFLOW,
  renderVisualDeltaCommitMessage,
  validateVisualDeltaWorkflowConfig,
} from "../shared/workflow-config.js";
import { announceVisualDeltaChanges } from "../shared/change-events.js";
import type { VisualDeltaChangeSetMutation } from "../shared/change-sets.js";
import {
  resolveVisualDeltaStoryConfig,
  VISUAL_DELTA_STORY_CONFIG_KEYS,
  type BaselineAlignmentMismatch,
  type ResolvedVisualDeltaStoryConfig,
  type VisualDeltaStoryConfig,
  type VisualDeltaStoryConfigKey,
  type VisualDeltaStoryConfigUpdate,
  type VisualDeltaStoryConfigUpdateResponse,
} from "../shared/story-config.js";
import { RangeNumberInput } from "./RangeNumberInput.js";
import {
  VISUAL_DELTA_BROWSERS,
  visualDeltaBrowserLabel,
  type VisualDeltaBrowser,
} from "../shared/environments.js";

const Root = styled.div(({ theme }) => ({
  display: "flex",
  flex: 1,
  minHeight: 0,
  height: "100%",
  flexDirection: "column",
  overflowY: "auto",
  fontSize: 12,
  color: theme.color.defaultText,
  background: theme.background.app,
}));

const StickyHeader = styled.div(({ theme }) => ({
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 16px 0",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
}));

const Heading = styled.div({
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
});

const HeadingCopy = styled.div({
  display: "flex",
  flex: 1,
  minWidth: 0,
  flexDirection: "column",
  gap: 3,
});

const Title = styled.h3(({ theme }) => ({
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: theme.color.defaultText,
}));

const Hint = styled.p(({ theme }) => ({
  margin: 0,
  color: theme.textMutedColor,
  lineHeight: 1.4,
}));

const TabList = styled.div({
  display: "flex",
  gap: 16,
});

const Tab = styled.button<{ $selected: boolean }>(({ theme, $selected }) => ({
  appearance: "none",
  margin: 0,
  padding: "7px 1px 8px",
  border: 0,
  borderBottom: `2px solid ${
    $selected ? theme.color.secondary : "transparent"
  }`,
  background: "transparent",
  color: $selected ? theme.color.secondary : theme.color.defaultText,
  cursor: "pointer",
  font: "inherit",
  fontWeight: $selected ? 700 : 600,
}));

const Content = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "14px 16px 24px",
});

const DefaultsGrid = styled.div({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
});

const Field = styled.label(({ theme }) => ({
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 5,
  padding: 10,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.content,
}));

const FieldLabel = styled.span({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  fontWeight: 650,
});

const Source = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 10,
  fontWeight: 500,
}));

const FieldHint = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 10,
  lineHeight: 1.35,
}));

const Input = styled.input(({ theme }) => ({
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "7px 8px",
  border: `1px solid ${theme.input.border}`,
  borderRadius: theme.input.borderRadius,
  background: theme.input.background,
  color: theme.input.color,
  font: "inherit",
}));

const Select = styled.select(({ theme }) => ({
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "7px 8px",
  border: `1px solid ${theme.input.border}`,
  borderRadius: theme.input.borderRadius,
  background: theme.input.background,
  color: theme.input.color,
  font: "inherit",
}));

const CheckboxRow = styled.span({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 30,
});

const OffsetRow = styled.span({
  display: "flex",
  flexDirection: "column",
  gap: 8,
});

const Actions = styled.div({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
});

const Status = styled.span(({ theme }) => ({
  color:
    theme.base === "light"
      ? `color-mix(in srgb, ${theme.color.positive} 65%, black)`
      : theme.color.positive,
  lineHeight: 1.4,
}));

const StoryIdentity = styled.div({
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 2,
});

const StoryName = styled.strong(({ theme }) => ({
  color: theme.color.defaultText,
  fontSize: 12,
}));

const StoryId = styled.code(({ theme }) => ({
  color: theme.textMutedColor,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  overflowWrap: "anywhere",
}));

const AlignmentWarning = styled.div(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: 10,
  border: `1px solid ${theme.color.warning}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.content,
  lineHeight: 1.4,
}));

const AlignmentCopy = styled.div({
  display: "flex",
  minWidth: 0,
  flex: 1,
  flexDirection: "column",
  gap: 2,
});

const AlignmentTitle = styled.strong(({ theme }) => ({
  color:
    theme.base === "light"
      ? `color-mix(in srgb, ${theme.color.warning} 60%, black)`
      : theme.color.warning,
}));

const Validation = styled.ul(({ theme }) => ({
  margin: 0,
  padding: "8px 10px 8px 26px",
  border: `1px solid ${theme.color.negative}`,
  borderRadius: theme.appBorderRadius,
  color: theme.color.negative,
  background: theme.background.content,
}));

const Section = styled.section(({ theme }) => ({
  overflow: "hidden",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.content,
}));

const SectionTitle = styled.h4(({ theme }) => ({
  margin: 0,
  padding: "8px 10px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.hoverable,
  color: theme.color.defaultText,
  fontSize: 11,
  fontWeight: 700,
}));

const Rows = styled.dl({
  margin: 0,
});

const Row = styled.div(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "minmax(120px, 0.35fr) minmax(0, 1fr)",
  gap: 12,
  padding: "7px 10px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  "&:last-child": { borderBottom: "none" },
}));

const Label = styled.dt(({ theme }) => ({
  color: theme.textMutedColor,
}));

const Value = styled.dd(({ theme }) => ({
  margin: 0,
  minWidth: 0,
  overflowWrap: "anywhere",
  color: theme.color.defaultText,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 11,
}));

const Diagnostics = styled.ul({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

const Diagnostic = styled.li<{
  $severity: VisualDeltaConfigDiagnostic["severity"];
}>(({ theme, $severity }) => ({
  padding: "8px 10px",
  borderRadius: theme.appBorderRadius,
  border: `1px solid ${
    $severity === "error"
      ? theme.color.negative
      : $severity === "warning"
        ? theme.color.warning
        : theme.appBorderColor
  }`,
  background: theme.background.content,
  lineHeight: 1.4,
}));

const DiagnosticTitle = styled.strong({
  display: "block",
  marginBottom: 2,
});

const RawDetails = styled.details(({ theme }) => ({
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.content,
  "& > summary": {
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 600,
  },
}));

const Pre = styled.pre(({ theme }) => ({
  margin: 0,
  padding: 12,
  overflow: "auto",
  maxHeight: 360,
  fontSize: 11,
  lineHeight: 1.45,
  fontFamily: theme.typography.fonts.mono,
  borderTop: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
}));

export type ConfigurationSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export function configurationSections(
  config: VisualDeltaResolvedConfig,
): ConfigurationSection[] {
  const yesNo = (value: boolean) => (value ? "Ready" : "Not ready");
  return [
    {
      title: "Setup",
      rows: [
        { label: "Visual suite", value: yesNo(config.onboarding.suiteReady) },
        {
          label: "Playwright config",
          value: yesNo(config.onboarding.playwrightConfigReady),
        },
        {
          label: "Snapshot directory",
          value: `${yesNo(config.onboarding.snapshotDirExists)} · ${config.options.snapshotDir}`,
        },
      ],
    },
    {
      title: "Baselines",
      rows: [
        { label: "Path mode", value: config.options.baselinePathMode },
        {
          label: "Pass threshold",
          value: `${config.playwrightPassThresholdPercent}%`,
        },
        { label: "Project config", value: config.projectConfigPath },
        { label: "Package root", value: config.options.root },
      ],
    },
    {
      title: "Capture",
      rows: [
        {
          label: "Device scale factor",
          value: String(config.projectDefaults.deviceScaleFactor),
        },
        {
          label: "Static server",
          value: `localhost:${config.options.visualServerPort}`,
        },
        {
          label: "Rebuild",
          value: config.options.allowRebuild ? "Allowed" : "Disabled",
        },
        {
          label: "Addon source",
          value: config.options.addonSrcDir ?? "Packaged distribution",
        },
      ],
    },
    {
      title: "Workflow",
      rows: [
        {
          label: "Auto-accept live stories",
          value: config.workflow.autoAcceptLiveStoryComparisons
            ? "Enabled"
            : "Disabled",
        },
        {
          label: "Reuse canonical actuals",
          value: config.workflow.reuseActualComparisons
            ? "Enabled"
            : "Disabled",
        },
        { label: "VCS mode", value: config.workflow.vcs.mode },
        {
          label: "Detected VCS",
          value: config.vcs.kind?.toUpperCase() ?? "None",
        },
        {
          label: "VCS writes",
          value: config.vcs.writeAllowed ? "Allowed" : "Disabled",
        },
      ],
    },
    {
      title: "Commands",
      rows: [
        {
          label: "Update",
          value: config.options.visualUpdateArgs.join(" "),
        },
        {
          label: "Interaction",
          value: config.options.visualInteractionUpdateArgs.join(" "),
        },
        { label: "Test", value: config.options.visualTestArgs.join(" ") },
      ],
    },
  ];
}

function fallbackDiagnostics(
  config: VisualDeltaResolvedConfig,
): VisualDeltaConfigDiagnostic[] {
  return (config.warnings ?? []).map((message, index) => ({
    code: `legacy-warning-${index}`,
    severity: "warning",
    message,
  }));
}

function defaultsFor(config: VisualDeltaResolvedConfig | null) {
  return config?.projectDefaults ?? BUILTIN_VISUAL_DELTA_DEFAULTS;
}

function workflowForConfig(
  config: VisualDeltaResolvedConfig | null | undefined,
): VisualDeltaWorkflowConfig {
  return {
    ...BUILTIN_VISUAL_DELTA_WORKFLOW,
    ...(config?.workflow ?? {}),
    vcs: {
      ...BUILTIN_VISUAL_DELTA_WORKFLOW.vcs,
      ...(config?.workflow?.vcs ?? {}),
    },
  };
}

async function saveDefaults(
  defaults: VisualDeltaProjectDefaults,
): Promise<VisualDeltaResolvedConfig> {
  const response = await fetch(VISUAL_DELTA_CONFIG_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectDefaults: defaults }),
  });
  const payload = (await response.json()) as
    | (VisualDeltaResolvedConfig & {
        changes?: VisualDeltaChangeSetMutation;
      })
    | { error?: string; changes?: VisualDeltaChangeSetMutation };
  announceVisualDeltaChanges(payload.changes);
  if (!response.ok || !("projectDefaults" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : `Config update failed (${response.status})`,
    );
  }
  return payload;
}

async function saveWorkflow(
  defaults: VisualDeltaProjectDefaults,
  workflow: VisualDeltaWorkflowConfig,
  browsers: VisualDeltaBrowser[],
): Promise<VisualDeltaResolvedConfig> {
  const response = await fetch(VISUAL_DELTA_CONFIG_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectDefaults: defaults, workflow, browsers }),
  });
  const payload = (await response.json()) as
    | (VisualDeltaResolvedConfig & {
        changes?: VisualDeltaChangeSetMutation;
      })
    | { error?: string; changes?: VisualDeltaChangeSetMutation };
  announceVisualDeltaChanges(payload.changes);
  if (!response.ok || !("projectDefaults" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : `Config update failed (${response.status})`,
    );
  }
  return payload;
}

export type ConfigurationStory = {
  id: string;
  name: string;
  parameters?: VisualDeltaParams;
  alignmentMismatch?: BaselineAlignmentMismatch | null;
};

function updatedStoryParameters(
  current: VisualDeltaParams | undefined,
  update: VisualDeltaStoryConfigUpdate,
): VisualDeltaParams {
  const next = { ...(current ?? {}), ...(update.values ?? {}) };
  for (const key of update.unset ?? []) delete next[key];
  return next;
}

function clonedStoryConfig(
  value: VisualDeltaStoryConfig,
): VisualDeltaStoryConfig {
  return {
    ...value,
    baselineLabelOffset: { ...value.baselineLabelOffset },
  };
}

function storyBaselineSummary(params: VisualDeltaParams | undefined): string {
  const images = params?.images;
  const list = images == null ? [] : Array.isArray(images) ? images : [images];
  const sources = list
    .map((image) => (typeof image === "string" ? image : image.src))
    .filter(Boolean);
  return sources.length ? sources.join(", ") : "No primary baseline configured";
}

export type ConfigurationPanelProps = {
  onClose: () => void;
  story?: ConfigurationStory;
  initialConfig?: VisualDeltaResolvedConfig;
  onSaveProjectDefaults?: (
    defaults: VisualDeltaProjectDefaults,
  ) => Promise<VisualDeltaResolvedConfig>;
  onSaveWorkflow?: (
    workflow: VisualDeltaWorkflowConfig,
    browsers: VisualDeltaBrowser[],
  ) => Promise<VisualDeltaResolvedConfig>;
  onSaveStoryConfig?: (
    update: VisualDeltaStoryConfigUpdate,
  ) => Promise<VisualDeltaStoryConfigUpdateResponse>;
  onStoryUpdated?: (update: VisualDeltaStoryConfigUpdate) => void;
  onUpdated?: (config: VisualDeltaResolvedConfig) => void;
};

export function ConfigurationPanel({
  onClose,
  story,
  initialConfig,
  onSaveProjectDefaults,
  onSaveWorkflow,
  onSaveStoryConfig,
  onStoryUpdated,
  onUpdated,
}: ConfigurationPanelProps) {
  const [config, setConfig] = useState<VisualDeltaResolvedConfig | null>(
    initialConfig ?? null,
  );
  const [draft, setDraft] = useState<VisualDeltaProjectDefaults>(() => ({
    ...defaultsFor(initialConfig ?? null),
    baselineLabelOffset: {
      ...defaultsFor(initialConfig ?? null).baselineLabelOffset,
    },
  }));
  const [workflowDraft, setWorkflowDraft] = useState<VisualDeltaWorkflowConfig>(
    () => workflowForConfig(initialConfig),
  );
  const [browserDraft, setBrowserDraft] = useState<VisualDeltaBrowser[]>(
    initialConfig?.browsers ?? ["chromium"],
  );
  const [tab, setTab] = useState<
    "story" | "defaults" | "workflow" | "resolved"
  >(story ? "story" : "defaults");
  const [storyParameters, setStoryParameters] = useState<
    VisualDeltaParams | undefined
  >(story?.parameters);
  const [storyDraft, setStoryDraft] = useState<VisualDeltaStoryConfig | null>(
    null,
  );
  const [changedStoryKeys, setChangedStoryKeys] = useState<
    VisualDeltaStoryConfigKey[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialConfig);
  const [saving, setSaving] = useState(false);
  const [storySaving, setStorySaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
      setDraft({
        ...defaultsFor(initialConfig),
        baselineLabelOffset: {
          ...defaultsFor(initialConfig).baselineLabelOffset,
        },
      });
      setWorkflowDraft(workflowForConfig(initialConfig));
      setBrowserDraft([...(initialConfig.browsers ?? ["chromium"])]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(VISUAL_DELTA_CONFIG_PATH);
        if (!res.ok) {
          throw new Error(`Config request failed (${res.status})`);
        }
        const data = (await res.json()) as VisualDeltaResolvedConfig;
        if (!cancelled) {
          setConfig(data);
          setDraft({
            ...defaultsFor(data),
            baselineLabelOffset: {
              ...defaultsFor(data).baselineLabelOffset,
            },
          });
          setWorkflowDraft(workflowForConfig(data));
          setBrowserDraft([...(data.browsers ?? ["chromium"])]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load Visual Delta configuration",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialConfig]);

  useEffect(() => {
    setStoryParameters(story?.parameters);
    setChangedStoryKeys([]);
    setSaved(null);
    if (story) setTab("story");
  }, [story?.id, story?.parameters]);

  const sections = useMemo(
    () => (config ? configurationSections(config) : []),
    [config],
  );
  const resolvedStory = useMemo<ResolvedVisualDeltaStoryConfig | null>(
    () =>
      story && config
        ? resolveVisualDeltaStoryConfig(
            storyParameters,
            config.projectDefaults,
            config.projectDefaultSources,
          )
        : null,
    [config, story, storyParameters],
  );
  useEffect(() => {
    if (!resolvedStory) {
      setStoryDraft(null);
      return;
    }
    setStoryDraft(clonedStoryConfig(resolvedStory.values));
  }, [resolvedStory]);
  const alignmentMismatch =
    story?.alignmentMismatch &&
    resolvedStory?.values.align === story.alignmentMismatch.configured
      ? story.alignmentMismatch
      : null;

  const diagnostics = config
    ? (config.diagnostics ?? fallbackDiagnostics(config))
    : [];
  const validation = validateVisualDeltaProjectDefaults(draft, {
    requireAll: true,
    rejectUnknown: true,
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(defaultsFor(config));
  const workflowValidation = validateVisualDeltaWorkflowConfig(workflowDraft, {
    rejectUnknown: true,
  });
  const workflowDirty =
    JSON.stringify(workflowDraft) !==
      JSON.stringify(config?.workflow ?? BUILTIN_VISUAL_DELTA_WORKFLOW) ||
    JSON.stringify(browserDraft) !==
      JSON.stringify(config?.browsers ?? ["chromium"]);
  const browserValidationError =
    browserDraft.length === 0 ? "Enable at least one browser." : null;
  const workflowMessagePreview = renderVisualDeltaCommitMessage(
    workflowDraft.vcs.commitMessageTemplate,
    {
      action: "update baseline",
      scope: story?.name || "2 stories",
      storyId: story?.id,
      storyName: story?.name,
      count: story ? 1 : 2,
    },
  );
  const source = (key: keyof VisualDeltaProjectDefaults) =>
    config?.projectDefaultSources?.[key] ?? "built-in";
  const setNumber = (
    key:
      | "passThresholdPercent"
      | "diffThreshold"
      | "delay"
      | "deviceScaleFactor"
      | "opacity",
    value: number,
  ) => {
    setSaved(null);
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };
  const setOffset = (key: "x" | "y", value: number) => {
    setSaved(null);
    setDraft((current) => ({
      ...current,
      baselineLabelOffset: {
        ...current.baselineLabelOffset,
        [key]: value,
      },
    }));
  };
  const boolean =
    (key: "diffIncludeAntiAliasing" | "cropToViewport") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.currentTarget.checked;
      setSaved(null);
      setDraft((current) => ({
        ...current,
        [key]: checked,
      }));
    };
  const markStoryChanged = (key: VisualDeltaStoryConfigKey) => {
    setSaved(null);
    setChangedStoryKeys((current) =>
      current.includes(key) ? current : [...current, key],
    );
  };
  const setStoryValue = <K extends VisualDeltaStoryConfigKey>(
    key: K,
    value: VisualDeltaStoryConfig[K],
  ) => {
    markStoryChanged(key);
    setStoryDraft((current) =>
      current ? ({ ...current, [key]: value } as VisualDeltaStoryConfig) : null,
    );
  };
  const setStoryOffset = (key: "x" | "y", value: number) => {
    markStoryChanged("baselineLabelOffset");
    setStoryDraft((current) =>
      current
        ? {
            ...current,
            baselineLabelOffset: {
              ...current.baselineLabelOffset,
              [key]: value,
            },
          }
        : null,
    );
  };
  const storySource = (key: VisualDeltaStoryConfigKey) =>
    resolvedStory?.sources[key] ?? "built-in";

  const persistStoryUpdate = async (
    update: VisualDeltaStoryConfigUpdate,
    message: string,
  ) => {
    setStorySaving(true);
    setError(null);
    setSaved(null);
    try {
      await (onSaveStoryConfig ?? putVisualStoryConfig)(update);
      setStoryParameters((current) => updatedStoryParameters(current, update));
      setChangedStoryKeys([]);
      onStoryUpdated?.(update);
      setSaved(message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save story configuration",
      );
    } finally {
      setStorySaving(false);
    }
  };

  const handleSaveStory = async () => {
    if (!story || !storyDraft || changedStoryKeys.length === 0) return;
    const values: Partial<VisualDeltaStoryConfig> = {};
    for (const key of changedStoryKeys) {
      Object.assign(values, { [key]: storyDraft[key] });
    }
    await persistStoryUpdate(
      { storyId: story.id, values },
      "Story configuration saved. The next static visual run will rebuild.",
    );
  };

  const handleResetStory = async () => {
    if (!story || !resolvedStory) return;
    const unset = VISUAL_DELTA_STORY_CONFIG_KEYS.filter(
      (key) => key in resolvedStory.overrides,
    );
    if (unset.length === 0) return;
    await persistStoryUpdate(
      { storyId: story.id, unset },
      "Story overrides removed; project and built-in defaults now apply.",
    );
  };

  const handleRepairAlignment = async () => {
    if (!story || !alignmentMismatch) return;
    const align = alignmentMismatch.recommended;
    await persistStoryUpdate(
      { storyId: story.id, values: { align } },
      `Story alignment updated to ${align}.`,
    );
  };

  const handleSave = async () => {
    if (validation.errors.length) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const next = await (onSaveProjectDefaults ?? saveDefaults)(draft);
      setConfig(next);
      setDraft({
        ...next.projectDefaults,
        baselineLabelOffset: { ...next.projectDefaults.baselineLabelOffset },
      });
      onUpdated?.(next);
      setSaved(
        "Project defaults saved. The next static visual run will rebuild.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save Visual Delta configuration",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (workflowValidation.errors.length || browserValidationError || !config)
      return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const next = await (onSaveWorkflow
        ? onSaveWorkflow(workflowDraft, browserDraft)
        : saveWorkflow(config.projectDefaults, workflowDraft, browserDraft));
      setConfig(next);
      setWorkflowDraft(workflowForConfig(next));
      setBrowserDraft([...(next.browsers ?? ["chromium"])]);
      onUpdated?.(next);
      setSaved(
        "Workflow saved. This policy change remains available for manual review.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save Visual Delta workflow",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Root>
      <StickyHeader>
        <Heading>
          <HeadingCopy>
            <Title>Configuration</Title>
            <Hint>
              Edit the current story, change safe project defaults, or inspect
              the complete resolved host configuration.
            </Hint>
          </HeadingCopy>
          <Button size="small" onClick={onClose} ariaLabel="Back to panel">
            Back
          </Button>
        </Heading>
        <TabList role="tablist" aria-label="Configuration views">
          {story ? (
            <Tab
              type="button"
              role="tab"
              aria-selected={tab === "story"}
              $selected={tab === "story"}
              onClick={() => setTab("story")}
            >
              Story
            </Tab>
          ) : null}
          <Tab
            type="button"
            role="tab"
            aria-selected={tab === "defaults"}
            $selected={tab === "defaults"}
            onClick={() => setTab("defaults")}
          >
            Defaults
          </Tab>
          <Tab
            type="button"
            role="tab"
            aria-selected={tab === "workflow"}
            $selected={tab === "workflow"}
            onClick={() => setTab("workflow")}
          >
            Workflow
          </Tab>
          <Tab
            type="button"
            role="tab"
            aria-selected={tab === "resolved"}
            $selected={tab === "resolved"}
            onClick={() => setTab("resolved")}
          >
            Resolved
          </Tab>
        </TabList>
      </StickyHeader>

      <Content
        role="tabpanel"
        aria-label={
          tab === "story"
            ? "Story"
            : tab === "defaults"
              ? "Defaults"
              : tab === "workflow"
                ? "Workflow"
                : "Resolved"
        }
      >
        {loading ? <Hint role="status">Loading configuration…</Hint> : null}
        {error ? <Hint role="alert">{error}</Hint> : null}
        {saved ? <Status role="status">{saved}</Status> : null}

        {tab === "story" ? (
          story && storyDraft && resolvedStory ? (
            <>
              <StoryIdentity>
                <StoryName>{story.name}</StoryName>
                <StoryId>{story.id}</StoryId>
              </StoryIdentity>

              {alignmentMismatch ? (
                <AlignmentWarning
                  role="alert"
                  aria-label="Story alignment configuration mismatch"
                >
                  <AlignmentCopy>
                    <AlignmentTitle>
                      Alignment does not describe this baseline
                    </AlignmentTitle>
                    <span>
                      The {alignmentMismatch.baselineCss.width}×
                      {alignmentMismatch.baselineCss.height} CSS px baseline is{" "}
                      {alignmentMismatch.reason === "viewport-sized-baseline"
                        ? "viewport-sized"
                        : "component-sized"}
                      , but this story is configured as{" "}
                      <code>{alignmentMismatch.configured}</code>. Visual Delta
                      is correcting placement at runtime; persist{" "}
                      <code>{alignmentMismatch.recommended}</code> to describe
                      the capture accurately.
                    </span>
                  </AlignmentCopy>
                  <Button
                    size="small"
                    variant="solid"
                    ariaLabel={`Use ${alignmentMismatch.recommended} alignment`}
                    disabled={storySaving}
                    onClick={() => void handleRepairAlignment()}
                  >
                    {storySaving
                      ? "Updating…"
                      : `Use ${alignmentMismatch.recommended}`}
                  </Button>
                </AlignmentWarning>
              ) : null}

              <Section>
                <SectionTitle>Story source</SectionTitle>
                <Rows>
                  <Row>
                    <Label>Primary baseline</Label>
                    <Value>{storyBaselineSummary(storyParameters)}</Value>
                  </Row>
                  <Row>
                    <Label>Overrides</Label>
                    <Value>
                      {Object.keys(resolvedStory.overrides).length
                        ? Object.keys(resolvedStory.overrides).join(", ")
                        : "None · project and built-in defaults apply"}
                    </Value>
                  </Row>
                </Rows>
              </Section>

              <DefaultsGrid>
                <Field>
                  <FieldLabel>
                    Alignment <Source>{storySource("align")}</Source>
                  </FieldLabel>
                  <Select
                    aria-label="Story baseline alignment"
                    value={storyDraft.align}
                    onChange={(event) =>
                      setStoryValue(
                        "align",
                        event.currentTarget
                          .value as VisualDeltaStoryConfig["align"],
                      )
                    }
                  >
                    <option value="canvas">Story canvas</option>
                    <option value="viewport">Capture viewport</option>
                  </Select>
                  <FieldHint>
                    Canvas pins component clips to the story subject; viewport
                    pins full captures to the iframe origin.
                  </FieldHint>
                </Field>
                <Field>
                  <FieldLabel>
                    Placement <Source>{storySource("placement")}</Source>
                  </FieldLabel>
                  <Select
                    aria-label="Story baseline placement"
                    value={storyDraft.placement}
                    onChange={(event) =>
                      setStoryValue(
                        "placement",
                        event.currentTarget
                          .value as VisualDeltaStoryConfig["placement"],
                      )
                    }
                  >
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                    <option value="center">Centered overlay</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>
                    Pass threshold (%){" "}
                    <Source>{storySource("passThresholdPercent")}</Source>
                  </FieldLabel>
                  <RangeNumberInput
                    label="Story pass threshold percentage"
                    min={0}
                    max={100}
                    step={0.001}
                    value={storyDraft.passThresholdPercent}
                    suffix="%"
                    onChange={(value) =>
                      setStoryValue("passThresholdPercent", value)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    Pixel diff threshold{" "}
                    <Source>{storySource("diffThreshold")}</Source>
                  </FieldLabel>
                  <RangeNumberInput
                    label="Story pixel diff threshold"
                    min={0}
                    max={1}
                    step={0.001}
                    value={storyDraft.diffThreshold}
                    onChange={(value) => setStoryValue("diffThreshold", value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    Capture delay (ms) <Source>{storySource("delay")}</Source>
                  </FieldLabel>
                  <RangeNumberInput
                    label="Story capture delay milliseconds"
                    min={0}
                    max={60000}
                    step={1}
                    value={storyDraft.delay}
                    inputWidth="5.25rem"
                    onChange={(value) => setStoryValue("delay", value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    Device scale factor{" "}
                    <Source>{storySource("deviceScaleFactor")}</Source>
                  </FieldLabel>
                  <RangeNumberInput
                    label="Story device scale factor"
                    min={1}
                    max={8}
                    step={1}
                    value={storyDraft.deviceScaleFactor}
                    inputWidth="4rem"
                    onChange={(value) =>
                      setStoryValue("deviceScaleFactor", value)
                    }
                  />
                  <FieldHint>
                    PNG natural size ÷ this value is the CSS display size.
                  </FieldHint>
                </Field>
                <Field>
                  <FieldLabel>
                    Overlay opacity <Source>{storySource("opacity")}</Source>
                  </FieldLabel>
                  <RangeNumberInput
                    label="Story overlay opacity"
                    min={0}
                    max={1}
                    step={0.05}
                    value={storyDraft.opacity}
                    onChange={(value) => setStoryValue("opacity", value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    Baseline label offset{" "}
                    <Source>{storySource("baselineLabelOffset")}</Source>
                  </FieldLabel>
                  <OffsetRow>
                    <RangeNumberInput
                      label="Story baseline label X offset"
                      min={-1000}
                      max={1000}
                      step={1}
                      value={storyDraft.baselineLabelOffset.x}
                      inputWidth="4rem"
                      onChange={(value) => setStoryOffset("x", value)}
                    />
                    <RangeNumberInput
                      label="Story baseline label Y offset"
                      min={-1000}
                      max={1000}
                      step={1}
                      value={storyDraft.baselineLabelOffset.y}
                      inputWidth="4rem"
                      onChange={(value) => setStoryOffset("y", value)}
                    />
                  </OffsetRow>
                </Field>
                <Field>
                  <FieldLabel>
                    Capture behavior <Source>effective story</Source>
                  </FieldLabel>
                  <CheckboxRow>
                    <Input
                      aria-label="Story include anti-aliasing differences"
                      type="checkbox"
                      checked={storyDraft.diffIncludeAntiAliasing}
                      onChange={(event) =>
                        setStoryValue(
                          "diffIncludeAntiAliasing",
                          event.currentTarget.checked,
                        )
                      }
                      style={{ width: 16 }}
                    />
                    Include anti-aliasing differences
                    <Source>{storySource("diffIncludeAntiAliasing")}</Source>
                  </CheckboxRow>
                  <CheckboxRow>
                    <Input
                      aria-label="Story crop capture to viewport"
                      type="checkbox"
                      checked={storyDraft.cropToViewport}
                      onChange={(event) =>
                        setStoryValue(
                          "cropToViewport",
                          event.currentTarget.checked,
                        )
                      }
                      style={{ width: 16 }}
                    />
                    Crop HTML capture to viewport
                    <Source>{storySource("cropToViewport")}</Source>
                  </CheckboxRow>
                  <CheckboxRow>
                    <Input
                      aria-label="Story invert baseline colors"
                      type="checkbox"
                      checked={storyDraft.colorInversion}
                      onChange={(event) =>
                        setStoryValue(
                          "colorInversion",
                          event.currentTarget.checked,
                        )
                      }
                      style={{ width: 16 }}
                    />
                    Invert baseline colors
                    <Source>{storySource("colorInversion")}</Source>
                  </CheckboxRow>
                </Field>
              </DefaultsGrid>

              <Actions>
                <Button
                  size="small"
                  variant="solid"
                  ariaLabel={false}
                  disabled={changedStoryKeys.length === 0 || storySaving}
                  onClick={() => void handleSaveStory()}
                >
                  {storySaving ? "Saving…" : "Save story"}
                </Button>
                <Button
                  size="small"
                  ariaLabel={false}
                  disabled={changedStoryKeys.length === 0 || storySaving}
                  onClick={() => {
                    setStoryDraft(clonedStoryConfig(resolvedStory.values));
                    setChangedStoryKeys([]);
                    setError(null);
                    setSaved(null);
                  }}
                >
                  Revert unsaved changes
                </Button>
                <Button
                  size="small"
                  ariaLabel={false}
                  disabled={
                    Object.keys(resolvedStory.overrides).length === 0 ||
                    storySaving
                  }
                  onClick={() => void handleResetStory()}
                >
                  Remove story overrides
                </Button>
              </Actions>
            </>
          ) : (
            <Hint>No story configuration is available.</Hint>
          )
        ) : tab === "defaults" ? (
          <>
            <DefaultsGrid>
              <Field>
                <FieldLabel>
                  Pass threshold (%){" "}
                  <Source>{source("passThresholdPercent")}</Source>
                </FieldLabel>
                <RangeNumberInput
                  label="Pass threshold percentage"
                  min={0}
                  max={100}
                  step={0.001}
                  value={draft.passThresholdPercent}
                  suffix="%"
                  onChange={(value) => setNumber("passThresholdPercent", value)}
                />
                <FieldHint>
                  Maximum changed-pixel percentage that passes.
                </FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Pixel diff threshold{" "}
                  <Source>{source("diffThreshold")}</Source>
                </FieldLabel>
                <RangeNumberInput
                  label="Pixel diff threshold"
                  min={0}
                  max={1}
                  step={0.001}
                  value={draft.diffThreshold}
                  onChange={(value) => setNumber("diffThreshold", value)}
                />
                <FieldHint>Pixelmatch color sensitivity from 0 to 1.</FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Capture delay (ms) <Source>{source("delay")}</Source>
                </FieldLabel>
                <RangeNumberInput
                  label="Capture delay milliseconds"
                  min={0}
                  max={60000}
                  step={1}
                  value={draft.delay}
                  inputWidth="5.25rem"
                  onChange={(value) => setNumber("delay", value)}
                />
                <FieldHint>
                  Applied once after Storybook reports storyFinished.
                </FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Device scale factor{" "}
                  <Source>{source("deviceScaleFactor")}</Source>
                </FieldLabel>
                <RangeNumberInput
                  label="Device scale factor"
                  min={1}
                  max={8}
                  step={1}
                  value={draft.deviceScaleFactor}
                  inputWidth="4rem"
                  onChange={(value) => setNumber("deviceScaleFactor", value)}
                />
                <FieldHint>
                  Default capture density (1–8). Image entries may override.
                  Existing 3× baselines need project value 3.
                </FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Overlay opacity <Source>{source("opacity")}</Source>
                </FieldLabel>
                <RangeNumberInput
                  label="Overlay opacity"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.opacity}
                  onChange={(value) => setNumber("opacity", value)}
                />
                <FieldHint>Used by the centered baseline overlay.</FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Default placement <Source>{source("placement")}</Source>
                </FieldLabel>
                <Select
                  aria-label="Default baseline placement"
                  value={draft.placement}
                  onChange={(event) => {
                    const placement = event.currentTarget
                      .value as VisualDeltaProjectDefaults["placement"];
                    setDraft((current) => ({
                      ...current,
                      placement,
                    }));
                  }}
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                  <option value="center">Centered overlay</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  Baseline label offset{" "}
                  <Source>{source("baselineLabelOffset")}</Source>
                </FieldLabel>
                <OffsetRow>
                  <RangeNumberInput
                    label="Baseline label X offset"
                    min={-1000}
                    max={1000}
                    step={1}
                    value={draft.baselineLabelOffset.x}
                    inputWidth="4rem"
                    onChange={(value) => setOffset("x", value)}
                  />
                  <RangeNumberInput
                    label="Baseline label Y offset"
                    min={-1000}
                    max={1000}
                    step={1}
                    value={draft.baselineLabelOffset.y}
                    inputWidth="4rem"
                    onChange={(value) => setOffset("y", value)}
                  />
                </OffsetRow>
                <FieldHint>
                  X/Y pixels after the default 6px top-start anchor.
                </FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Preview split opening zoom{" "}
                  <Source>{source("previewSplitZoomDefault")}</Source>
                </FieldLabel>
                <Select
                  aria-label="Preview split opening zoom"
                  value={draft.previewSplitZoomDefault}
                  onChange={(event) => {
                    const previewSplitZoomDefault = event.currentTarget
                      .value as "fit" | "100%";
                    setDraft((current) => ({
                      ...current,
                      previewSplitZoomDefault,
                    }));
                  }}
                >
                  <option value="fit">Fit</option>
                  <option value="100%">100%</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  Diff result opening zoom{" "}
                  <Source>{source("diffResultZoomDefault")}</Source>
                </FieldLabel>
                <Select
                  aria-label="Diff result opening zoom"
                  value={draft.diffResultZoomDefault}
                  onChange={(event) => {
                    const diffResultZoomDefault = event.currentTarget.value as
                      | "fit"
                      | "100%";
                    setDraft((current) => ({
                      ...current,
                      diffResultZoomDefault,
                    }));
                  }}
                >
                  <option value="fit">Fit</option>
                  <option value="100%">100%</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  Capture behavior <Source>project</Source>
                </FieldLabel>
                <CheckboxRow>
                  <Input
                    aria-label="Include anti-aliasing differences"
                    type="checkbox"
                    checked={draft.diffIncludeAntiAliasing}
                    onChange={boolean("diffIncludeAntiAliasing")}
                    style={{ width: 16 }}
                  />
                  Include anti-aliasing differences
                </CheckboxRow>
                <CheckboxRow>
                  <Input
                    aria-label="Crop capture to viewport"
                    type="checkbox"
                    checked={draft.cropToViewport}
                    onChange={boolean("cropToViewport")}
                    style={{ width: 16 }}
                  />
                  Crop HTML capture to viewport
                </CheckboxRow>
              </Field>
            </DefaultsGrid>

            {validation.errors.length ? (
              <Validation aria-label="Configuration validation errors">
                {validation.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </Validation>
            ) : null}

            <Actions>
              <Button
                size="small"
                variant="solid"
                ariaLabel={false}
                disabled={!dirty || saving || validation.errors.length > 0}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                size="small"
                ariaLabel={false}
                disabled={!dirty || saving}
                onClick={() => {
                  setDraft({
                    ...defaultsFor(config),
                    baselineLabelOffset: {
                      ...defaultsFor(config).baselineLabelOffset,
                    },
                  });
                  setError(null);
                  setSaved(null);
                }}
              >
                Revert unsaved changes
              </Button>
              <Button
                size="small"
                ariaLabel={false}
                disabled={saving}
                onClick={() => {
                  setDraft({
                    ...BUILTIN_VISUAL_DELTA_DEFAULTS,
                    baselineLabelOffset: {
                      ...BUILTIN_VISUAL_DELTA_DEFAULTS.baselineLabelOffset,
                    },
                  });
                  setError(null);
                  setSaved(null);
                }}
              >
                Restore built-ins
              </Button>
            </Actions>
          </>
        ) : tab === "workflow" ? (
          <>
            <DefaultsGrid>
              <Field>
                <FieldLabel>Browser matrix</FieldLabel>
                {VISUAL_DELTA_BROWSERS.map((browser) => (
                  <CheckboxRow key={browser}>
                    <Input
                      aria-label={`Enable ${visualDeltaBrowserLabel(browser)}`}
                      type="checkbox"
                      checked={browserDraft.includes(browser)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSaved(null);
                        setBrowserDraft((current) =>
                          checked
                            ? [...current, browser]
                            : current.filter((item) => item !== browser),
                        );
                      }}
                      style={{ width: 16 }}
                    />
                    {visualDeltaBrowserLabel(browser)}
                  </CheckboxRow>
                ))}
                <FieldHint>
                  Full runs execute every enabled browser. Chromium is the
                  zero-configuration default.
                </FieldHint>
              </Field>

              <Field>
                <FieldLabel>Visual test failure mode</FieldLabel>
                <Select
                  aria-label="Visual test failure mode"
                  value={workflowDraft.visualTestFailureMode}
                  onChange={(event) => {
                    const visualTestFailureMode = event.currentTarget
                      .value as VisualDeltaWorkflowConfig["visualTestFailureMode"];
                    setSaved(null);
                    setWorkflowDraft((current) => ({
                      ...current,
                      visualTestFailureMode,
                    }));
                  }}
                >
                  <option value="warn">Warn and exit successfully</option>
                  <option value="strict">Fail on visual warnings</option>
                </Select>
                <FieldHint>
                  Infrastructure errors remain fatal in both modes.
                </FieldHint>
              </Field>

              <Field>
                <FieldLabel>Live comparison review</FieldLabel>
                <CheckboxRow>
                  <Input
                    aria-label="Automatically accept passing Diff Browser, Story, and Run Diff"
                    type="checkbox"
                    checked={workflowDraft.autoAcceptLiveStoryComparisons}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSaved(null);
                      setWorkflowDraft((current) => ({
                        ...current,
                        autoAcceptLiveStoryComparisons: checked,
                      }));
                    }}
                    style={{ width: 16 }}
                  />
                  Auto-accept passing Diff Browser, Story, and Run Diff
                </CheckboxRow>
                <FieldHint>
                  Fresh passed or within-tolerance browser comparisons mark
                  stories visual-approved only after the configured matrix is
                  clean. Failures and warnings never change review state.
                </FieldHint>
              </Field>

              <Field>
                <FieldLabel>Comparison capture</FieldLabel>
                <CheckboxRow>
                  <Input
                    aria-label="Reuse fresh canonical actual images"
                    type="checkbox"
                    checked={workflowDraft.reuseActualComparisons}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSaved(null);
                      setWorkflowDraft((current) => ({
                        ...current,
                        reuseActualComparisons: checked,
                      }));
                    }}
                    style={{ width: 16 }}
                  />
                  Reuse fresh canonical actual images
                </CheckboxRow>
                <FieldHint>
                  Disable to always launch the canonical browser. Any run can
                  also request a one-time fresh capture.
                </FieldHint>
              </Field>

              <Field>
                <FieldLabel>
                  VCS workflow <Source>project opt-in</Source>
                </FieldLabel>
                <Select
                  aria-label="Visual Delta VCS workflow mode"
                  value={workflowDraft.vcs.mode}
                  onChange={(event) => {
                    const mode = event.currentTarget
                      .value as VisualDeltaWorkflowConfig["vcs"]["mode"];
                    setSaved(null);
                    setWorkflowDraft((current) => ({
                      ...current,
                      vcs: { ...current.vcs, mode },
                    }));
                  }}
                >
                  <option value="off">Off</option>
                  <option value="review">Review before commit</option>
                  <option value="auto">Auto-commit safe changes</option>
                </Select>
                <FieldHint>
                  Review opens the changed-files screen. Auto commits only a
                  complete safe Visual Delta change set.
                </FieldHint>
              </Field>

              <Field>
                <FieldLabel>Commit message template</FieldLabel>
                <Input
                  aria-label="Visual Delta commit message template"
                  value={workflowDraft.vcs.commitMessageTemplate}
                  onChange={(event) => {
                    const commitMessageTemplate = event.currentTarget.value;
                    setSaved(null);
                    setWorkflowDraft((current) => ({
                      ...current,
                      vcs: { ...current.vcs, commitMessageTemplate },
                    }));
                  }}
                />
                <FieldHint>
                  Tokens: {"{action}"}, {"{scope}"}, {"{storyId}"},{" "}
                  {"{storyName}"}, {"{count}"}.
                </FieldHint>
                <StoryId aria-label="Commit message preview">
                  {workflowMessagePreview || "Commit message is empty"}
                </StoryId>
              </Field>

              <Field>
                <FieldLabel>
                  Repository capability <Source>host gate</Source>
                </FieldLabel>
                <Rows>
                  <Row>
                    <Label>Detected VCS</Label>
                    <Value>{config?.vcs.kind?.toUpperCase() ?? "None"}</Value>
                  </Row>
                  <Row>
                    <Label>Commit writes</Label>
                    <Value>
                      {config?.vcs.writeAllowed ? "Allowed" : "Disabled"}
                    </Value>
                  </Row>
                </Rows>
                {config?.vcs.reason ? (
                  <FieldHint role="status">{config.vcs.reason}</FieldHint>
                ) : null}
                <FieldHint>
                  The Storybook host must explicitly set allowVcsWrites. Visual
                  Delta never pushes or rewrites history.
                </FieldHint>
              </Field>
            </DefaultsGrid>

            {workflowValidation.errors.length ? (
              <Validation aria-label="Workflow validation errors">
                {workflowValidation.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </Validation>
            ) : null}
            {browserValidationError ? (
              <Validation aria-label="Browser validation errors">
                <li>{browserValidationError}</li>
              </Validation>
            ) : null}

            <Actions>
              <Button
                size="small"
                variant="solid"
                ariaLabel={false}
                disabled={
                  !workflowDirty ||
                  saving ||
                  workflowValidation.errors.length > 0 ||
                  Boolean(browserValidationError)
                }
                onClick={() => void handleSaveWorkflow()}
              >
                {saving ? "Saving…" : "Save workflow"}
              </Button>
              <Button
                size="small"
                ariaLabel={false}
                disabled={!workflowDirty || saving}
                onClick={() => {
                  setWorkflowDraft(workflowForConfig(config));
                  setBrowserDraft([...(config?.browsers ?? ["chromium"])]);
                  setError(null);
                  setSaved(null);
                }}
              >
                Revert unsaved changes
              </Button>
              <Button
                size="small"
                ariaLabel={false}
                disabled={saving}
                onClick={() => {
                  setWorkflowDraft({
                    ...BUILTIN_VISUAL_DELTA_WORKFLOW,
                    vcs: { ...BUILTIN_VISUAL_DELTA_WORKFLOW.vcs },
                  });
                  setBrowserDraft(["chromium"]);
                  setError(null);
                  setSaved(null);
                }}
              >
                Restore safe defaults
              </Button>
            </Actions>
          </>
        ) : (
          <>
            {diagnostics.length ? (
              <Diagnostics aria-label="Configuration diagnostics">
                {diagnostics.map((diagnostic) => (
                  <Diagnostic
                    key={diagnostic.code}
                    $severity={diagnostic.severity}
                  >
                    <DiagnosticTitle>
                      {diagnostic.severity === "error"
                        ? "Action required"
                        : diagnostic.severity === "warning"
                          ? "Check configuration"
                          : "Configuration note"}
                      {diagnostic.setting ? ` · ${diagnostic.setting}` : ""}
                    </DiagnosticTitle>
                    {diagnostic.message}
                    {diagnostic.suggestion ? ` ${diagnostic.suggestion}` : ""}
                  </Diagnostic>
                ))}
              </Diagnostics>
            ) : null}

            {sections.map((section) => (
              <Section key={section.title}>
                <SectionTitle>{section.title}</SectionTitle>
                <Rows>
                  {section.rows.map((row) => (
                    <Row key={row.label}>
                      <Label>{row.label}</Label>
                      <Value>{row.value}</Value>
                    </Row>
                  ))}
                </Rows>
              </Section>
            ))}

            {config ? (
              <RawDetails>
                <summary>Raw configuration</summary>
                <Pre>{JSON.stringify(config, null, 2)}</Pre>
              </RawDetails>
            ) : null}
          </>
        )}
      </Content>
    </Root>
  );
}
