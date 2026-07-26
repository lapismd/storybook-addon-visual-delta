import React, { useEffect, useMemo, useState } from "react";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import { VISUAL_DELTA_CONFIG_PATH } from "../constants.js";
import type {
  VisualDeltaConfigDiagnostic,
  VisualDeltaResolvedConfig,
} from "../shared/config-types.js";

const Root = styled.div(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "12px 16px 24px",
  fontSize: 12,
  color: theme.color.defaultText,
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

/**
 * Read-only, structured view of resolved host configuration. `initialConfig`
 * makes the production surface deterministic in stories and component tests.
 */
export function ConfigurationPanel({
  onClose,
  initialConfig,
}: {
  onClose: () => void;
  initialConfig?: VisualDeltaResolvedConfig;
}) {
  const [config, setConfig] = useState<VisualDeltaResolvedConfig | null>(
    initialConfig ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialConfig);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
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
        if (!cancelled) setConfig(data);
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

  return (
    <Root>
      <Heading>
        <HeadingCopy>
          <Title>Configuration</Title>
          <Hint>
            Resolved read-only values from Storybook and the Visual Delta
            Playwright host.
          </Hint>
        </HeadingCopy>
        <Button size="small" onClick={onClose} ariaLabel="Back to panel">
          Back
        </Button>
      </Heading>

      {loading ? <Hint role="status">Loading configuration…</Hint> : null}
      {error ? <Hint role="alert">{error}</Hint> : null}

      {diagnostics.length ? (
        <Diagnostics aria-label="Configuration diagnostics">
          {diagnostics.map((diagnostic) => (
            <Diagnostic key={diagnostic.code} $severity={diagnostic.severity}>
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
    </Root>
  );
}
