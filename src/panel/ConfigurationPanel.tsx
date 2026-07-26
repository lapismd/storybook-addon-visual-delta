import React, { useEffect, useMemo, useState } from "react";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import { VISUAL_DELTA_CONFIG_PATH } from "../constants.js";
import type {
  VisualDeltaConfigDiagnostic,
  VisualDeltaProjectDefaults,
  VisualDeltaResolvedConfig,
} from "../shared/config-types.js";
import {
  BUILTIN_VISUAL_DELTA_DEFAULTS,
  validateVisualDeltaProjectDefaults,
} from "../shared/project-defaults.js";

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
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
});

const Actions = styled.div({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
});

const Status = styled.span(({ theme }) => ({
  color: theme.color.positive,
  lineHeight: 1.4,
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

async function saveDefaults(
  defaults: VisualDeltaProjectDefaults,
): Promise<VisualDeltaResolvedConfig> {
  const response = await fetch(VISUAL_DELTA_CONFIG_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectDefaults: defaults }),
  });
  const payload = (await response.json()) as
    | VisualDeltaResolvedConfig
    | { error?: string };
  if (!response.ok || !("projectDefaults" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : `Config update failed (${response.status})`,
    );
  }
  return payload;
}

export type ConfigurationPanelProps = {
  onClose: () => void;
  initialConfig?: VisualDeltaResolvedConfig;
  onSaveProjectDefaults?: (
    defaults: VisualDeltaProjectDefaults,
  ) => Promise<VisualDeltaResolvedConfig>;
  onUpdated?: (config: VisualDeltaResolvedConfig) => void;
};

export function ConfigurationPanel({
  onClose,
  initialConfig,
  onSaveProjectDefaults,
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
  const [tab, setTab] = useState<"defaults" | "resolved">("defaults");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
      setDraft({
        ...defaultsFor(initialConfig),
        baselineLabelOffset: {
          ...defaultsFor(initialConfig).baselineLabelOffset,
        },
      });
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

  const sections = useMemo(
    () => (config ? configurationSections(config) : []),
    [config],
  );
  const diagnostics = config
    ? (config.diagnostics ?? fallbackDiagnostics(config))
    : [];
  const validation = validateVisualDeltaProjectDefaults(draft, {
    requireAll: true,
    rejectUnknown: true,
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(defaultsFor(config));
  const source = (key: keyof VisualDeltaProjectDefaults) =>
    config?.projectDefaultSources?.[key] ?? "built-in";
  const number =
    (key: "passThresholdPercent" | "diffThreshold" | "delay" | "opacity") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      setSaved(null);
      setDraft((current) => ({
        ...current,
        [key]: value === "" ? Number.NaN : Number(value),
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

  return (
    <Root>
      <StickyHeader>
        <Heading>
          <HeadingCopy>
            <Title>Configuration</Title>
            <Hint>
              Edit safe project defaults or inspect the complete resolved host
              configuration.
            </Hint>
          </HeadingCopy>
          <Button size="small" onClick={onClose} ariaLabel="Back to panel">
            Back
          </Button>
        </Heading>
        <TabList role="tablist" aria-label="Configuration views">
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
        aria-label={tab === "defaults" ? "Defaults" : "Resolved"}
      >
        {loading ? <Hint role="status">Loading configuration…</Hint> : null}
        {error ? <Hint role="alert">{error}</Hint> : null}
        {saved ? <Status role="status">{saved}</Status> : null}

        {tab === "defaults" ? (
          <>
            <DefaultsGrid>
              <Field>
                <FieldLabel>
                  Pass threshold (%){" "}
                  <Source>{source("passThresholdPercent")}</Source>
                </FieldLabel>
                <Input
                  aria-label="Pass threshold percentage"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={
                    Number.isFinite(draft.passThresholdPercent)
                      ? draft.passThresholdPercent
                      : ""
                  }
                  onChange={number("passThresholdPercent")}
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
                <Input
                  aria-label="Pixel diff threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={
                    Number.isFinite(draft.diffThreshold)
                      ? draft.diffThreshold
                      : ""
                  }
                  onChange={number("diffThreshold")}
                />
                <FieldHint>Pixelmatch color sensitivity from 0 to 1.</FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Capture delay (ms) <Source>{source("delay")}</Source>
                </FieldLabel>
                <Input
                  aria-label="Capture delay milliseconds"
                  type="number"
                  min={0}
                  max={60000}
                  step={1}
                  value={Number.isFinite(draft.delay) ? draft.delay : ""}
                  onChange={number("delay")}
                />
                <FieldHint>
                  Applied once after Storybook reports storyFinished.
                </FieldHint>
              </Field>
              <Field>
                <FieldLabel>
                  Overlay opacity <Source>{source("opacity")}</Source>
                </FieldLabel>
                <Input
                  aria-label="Overlay opacity"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number.isFinite(draft.opacity) ? draft.opacity : ""}
                  onChange={number("opacity")}
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
                  <Input
                    aria-label="Baseline label X offset"
                    type="number"
                    min={-1000}
                    max={1000}
                    value={draft.baselineLabelOffset.x}
                    onChange={(event) => {
                      const x = Number(event.currentTarget.value);
                      setDraft((current) => ({
                        ...current,
                        baselineLabelOffset: {
                          ...current.baselineLabelOffset,
                          x,
                        },
                      }));
                    }}
                  />
                  <Input
                    aria-label="Baseline label Y offset"
                    type="number"
                    min={-1000}
                    max={1000}
                    value={draft.baselineLabelOffset.y}
                    onChange={(event) => {
                      const y = Number(event.currentTarget.value);
                      setDraft((current) => ({
                        ...current,
                        baselineLabelOffset: {
                          ...current.baselineLabelOffset,
                          y,
                        },
                      }));
                    }}
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
