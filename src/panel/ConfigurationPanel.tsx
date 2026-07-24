import React, { useEffect, useState } from "react";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import { VISUAL_DELTA_CONFIG_PATH } from "../constants.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";

const Root = styled.div(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "12px 16px 24px",
  fontSize: 12,
  color: theme.color.defaultText,
}));

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

const Pre = styled.pre(({ theme }) => ({
  margin: 0,
  padding: 12,
  overflow: "auto",
  maxHeight: 360,
  fontSize: 11,
  lineHeight: 1.45,
  fontFamily: theme.typography.fonts.mono,
  borderRadius: theme.appBorderRadius,
  border: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const Warn = styled.ul(({ theme }) => ({
  margin: 0,
  paddingLeft: 18,
  color: theme.color.warning,
  lineHeight: 1.45,
}));

const Actions = styled.div({
  display: "flex",
  gap: 8,
});

/**
 * Read-only view of resolved host options (Chromatic Configuration screen analog).
 */
export function ConfigurationPanel({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<VisualDeltaResolvedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return (
    <Root>
      <Title>Configuration</Title>
      <Hint>
        Resolved host options from Storybook main (
        <code>options.visualDelta</code>). Edit the host wiring to change these
        values — this view is read-only.
      </Hint>
      <Actions>
        <Button size="small" onClick={onClose} ariaLabel="Back to panel">
          Back to panel
        </Button>
      </Actions>
      {loading ? <Hint>Loading…</Hint> : null}
      {error ? <Hint role="alert">{error}</Hint> : null}
      {config?.onboarding ? (
        <Hint>
          Onboarding:{" "}
          {config.onboarding.ready
            ? "suite + Playwright config ready"
            : config.onboarding.hint}{" "}
          {!config.onboarding.ready ? (
            <>
              (CLI: <code>pnpm exec visual-delta init</code>)
            </>
          ) : null}
        </Hint>
      ) : null}
      {config?.warnings && config.warnings.length > 0 ? (
        <Warn>
          {config.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </Warn>
      ) : null}
      {config ? (
        <Pre>
          {JSON.stringify(
            { options: config.options, onboarding: config.onboarding },
            null,
            2,
          )}
        </Pre>
      ) : null}
    </Root>
  );
}
