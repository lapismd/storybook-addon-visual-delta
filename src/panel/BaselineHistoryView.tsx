import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeftIcon, CommitIcon, SyncIcon } from "@storybook/icons";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  fetchBaselineHistory,
  fetchBaselineHistoryDiff,
  type BaselineHistoryDiffFile,
  type BaselineHistoryDiffResponse,
  type BaselineHistoryEntry,
  type BaselineHistoryResponse,
} from "../shared/baseline-history.js";
import {
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_PASS_THRESHOLD_PERCENT,
  VISUAL_DEVICE_SCALE_FACTOR,
} from "../constants.js";
import type { DiffResultData } from "../types.js";
import { DiffResult } from "./DiffResult.js";
import {
  compareImageSources,
  type ImageComparisonRunner,
} from "./image-comparison.js";
import { panelCanvasBackground } from "./styled.js";

export type BaselineHistoryTarget = {
  path: string;
  label: string;
  componentPath?: string;
};

export type BaselineHistoryLoader = typeof fetchBaselineHistory;
export type BaselineHistoryDiffLoader = typeof fetchBaselineHistoryDiff;

const Root = styled.section(({ theme }) => ({
  flex: "1 1 auto",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: panelCanvasBackground(theme),
}));

const Header = styled.header(({ theme }) => ({
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
  boxSizing: "border-box",
}));

const HeaderText = styled.div({
  minWidth: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 1,
});

const Title = styled.h2(({ theme }) => ({
  margin: 0,
  color: theme.color.defaultText,
  fontSize: theme.typography.size.s2,
  fontWeight: theme.typography.weight.bold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Subtitle = styled.div(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const VcsBadge = styled.span(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 7px",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 999,
  background: theme.background.app,
  color: theme.color.defaultText,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  "& svg": { width: 12, height: 12 },
}));

const HistoryContent = styled.div({
  flex: "1 1 auto",
  minHeight: 0,
  overflow: "auto",
});

const Workspace = styled.div<{ $compact: boolean }>(({ $compact }) => ({
  display: "grid",
  gridTemplateColumns: $compact
    ? "minmax(0, 1fr)"
    : "minmax(260px, 340px) minmax(0, 1fr)",
  gridTemplateRows: $compact
    ? "repeat(2, minmax(280px, 1fr))"
    : "minmax(0, 1fr)",
  height: $compact ? 640 : "clamp(420px, 58vh, 620px)",
  minHeight: 0,
}));

const Timeline = styled.div(({ theme }) => ({
  minHeight: 0,
  overflow: "auto",
  borderRight: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const TimelineHeader = styled.div(({ theme }) => ({
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 48px 48px",
  columnGap: 8,
  alignItems: "center",
  minHeight: 30,
  padding: "0 10px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
  color: theme.textMutedColor,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  "& > span:not(:first-of-type)": {
    justifySelf: "center",
  },
}));

const TimelineRow = styled.div<{ $working: boolean }>(
  ({ theme, $working }) => ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 48px 48px",
    columnGap: 8,
    alignItems: "center",
    minHeight: 68,
    padding: "8px 10px",
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: $working ? theme.background.hoverable : "transparent",
  }),
);

const RevisionMeta = styled.div({
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  paddingRight: 8,
});

const RevisionTitle = styled.span(({ theme }) => ({
  color: theme.color.defaultText,
  fontSize: 12,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const RevisionLine = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 10,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
}));

const Id = styled.code(({ theme }) => ({
  color: theme.color.defaultText,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
}));

const RadioCell = styled.label({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "stretch",
  cursor: "pointer",
  "& input": { cursor: "inherit" },
});

const CompareWorkspace = styled.div(({ theme }) => ({
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
  boxSizing: "border-box",
  background: panelCanvasBackground(theme),
}));

const SelectionHeader = styled.div({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
});

const SelectionCard = styled.div(({ theme }) => ({
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "8px 10px",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 4,
  background: theme.background.content,
}));

const SelectionLabel = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
}));

const ComparisonSurface = styled.div({
  flex: "1 1 auto",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
});

const Message = styled.pre(({ theme }) => ({
  margin: 0,
  padding: "8px 10px",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 4,
  background: theme.background.content,
  color: theme.textMutedColor,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
}));

const State = styled.div(({ theme }) => ({
  flex: "1 1 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  color: theme.textMutedColor,
  textAlign: "center",
  fontSize: 12,
}));

const ComponentDiffSection = styled.section(({ theme }) => ({
  padding: "18px 16px 22px",
  borderTop: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const ComponentDiffTitle = styled.h3(({ theme }) => ({
  margin: "0 0 12px",
  color: theme.textMutedColor,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
}));

const ComponentDiffHelp = styled.span(({ theme }) => ({
  marginLeft: 6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 14,
  height: 14,
  border: `1px solid ${theme.textMutedColor}`,
  borderRadius: "50%",
  fontSize: 9,
  letterSpacing: 0,
  cursor: "help",
}));

const DiffFileFrame = styled.div(({ theme }) => ({
  marginTop: 10,
  overflow: "auto",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 5,
  background: theme.background.content,
}));

const DiffFileHeader = styled.div(({ theme }) => ({
  position: "sticky",
  left: 0,
  minWidth: 720,
  padding: "7px 10px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
  color: theme.color.defaultText,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  fontWeight: 700,
}));

const DiffHunkHeader = styled.div(({ theme }) => ({
  minWidth: 720,
  padding: "3px 58px",
  background: `color-mix(in srgb, ${theme.color.secondary} 8%, ${theme.background.content})`,
  color: theme.textMutedColor,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  whiteSpace: "pre",
}));

const DiffRow = styled.div({
  display: "grid",
  gridTemplateColumns: "38px minmax(320px, 1fr) 38px minmax(320px, 1fr)",
  minWidth: 720,
});

const DiffNumber = styled.span<{
  $side: "before" | "after";
  $changed: boolean;
}>(({ theme, $side, $changed }) => ({
  padding: "2px 7px",
  borderRight: `1px solid ${theme.appBorderColor}`,
  background: $changed
    ? `color-mix(in srgb, ${
        $side === "before" ? theme.color.negative : theme.color.positive
      } 16%, ${theme.background.content})`
    : theme.background.app,
  color: theme.textMutedColor,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  lineHeight: 1.45,
  textAlign: "right",
  userSelect: "none",
}));

const DiffCode = styled.code<{
  $side: "before" | "after";
  $changed: boolean;
}>(({ theme, $side, $changed }) => ({
  display: "block",
  padding: "2px 9px",
  borderRight: `1px solid ${theme.appBorderColor}`,
  background: $changed
    ? `color-mix(in srgb, ${
        $side === "before" ? theme.color.negative : theme.color.positive
      } 11%, ${theme.background.content})`
    : theme.background.content,
  color: theme.color.defaultText,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  lineHeight: 1.45,
  whiteSpace: "pre",
}));

const ComponentDiffState = styled.div(({ theme }) => ({
  padding: "14px 10px",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 5,
  color: theme.textMutedColor,
  fontSize: 11,
}));

function fileLabel(file: BaselineHistoryDiffFile): string {
  if (file.beforePath === "/dev/null") return file.afterPath;
  if (file.afterPath === "/dev/null") return file.beforePath;
  return file.beforePath === file.afterPath
    ? file.afterPath
    : `${file.beforePath} → ${file.afterPath}`;
}

function ComponentSourceDiff({
  result,
}: {
  result: BaselineHistoryDiffResponse;
}) {
  return (
    <ComponentDiffSection aria-labelledby="visual-delta-component-diff-title">
      <ComponentDiffTitle id="visual-delta-component-diff-title">
        Component diff
        <ComponentDiffHelp
          title="Source changes from the current story/component folder between the selected baseline revisions"
          aria-label="About component diff"
        >
          ?
        </ComponentDiffHelp>
      </ComponentDiffTitle>
      {result.files.length === 0 ? (
        <ComponentDiffState>
          No component source changes were found between these baseline
          revisions.
        </ComponentDiffState>
      ) : (
        result.files.map((file) => (
          <DiffFileFrame key={`${file.beforePath}:${file.afterPath}`}>
            <DiffFileHeader>{fileLabel(file)}</DiffFileHeader>
            {file.hunks.map((hunk, hunkIndex) => (
              <React.Fragment key={`${hunk.header}:${hunkIndex}`}>
                <DiffHunkHeader>{hunk.header}</DiffHunkHeader>
                {hunk.lines.map((line, lineIndex) => {
                  const beforeChanged =
                    line.kind === "changed" || line.kind === "removed";
                  const afterChanged =
                    line.kind === "changed" || line.kind === "added";
                  return (
                    <DiffRow key={`${hunkIndex}:${lineIndex}`}>
                      <DiffNumber $side="before" $changed={beforeChanged}>
                        {line.beforeNumber ?? ""}
                      </DiffNumber>
                      <DiffCode $side="before" $changed={beforeChanged}>
                        {line.before == null
                          ? ""
                          : `${beforeChanged ? "− " : "  "}${line.before}`}
                      </DiffCode>
                      <DiffNumber $side="after" $changed={afterChanged}>
                        {line.afterNumber ?? ""}
                      </DiffNumber>
                      <DiffCode $side="after" $changed={afterChanged}>
                        {line.after == null
                          ? ""
                          : `${afterChanged ? "+ " : "  "}${line.after}`}
                      </DiffCode>
                    </DiffRow>
                  );
                })}
              </React.Fragment>
            ))}
          </DiffFileFrame>
        ))
      )}
      {result.truncated ? (
        <ComponentDiffState>
          The component diff was truncated to keep the panel responsive.
        </ComponentDiffState>
      ) : null}
    </ComponentDiffSection>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function chooseDefaults(entries: BaselineHistoryEntry[]): {
  before: string | null;
  after: string | null;
} {
  if (!entries.length) return { before: null, after: null };
  if (entries[0]?.source === "working-copy") {
    return {
      before: entries[1]?.revisionId ?? entries[0].revisionId,
      after: entries[0].revisionId,
    };
  }
  return {
    before: entries[1]?.revisionId ?? entries[0]!.revisionId,
    after: entries[0]!.revisionId,
  };
}

export function BaselineHistoryView({
  target,
  onClose,
  loadHistory = fetchBaselineHistory,
  loadComponentDiff = fetchBaselineHistoryDiff,
  compareImages = compareImageSources,
}: {
  target: BaselineHistoryTarget;
  onClose: () => void;
  loadHistory?: BaselineHistoryLoader;
  loadComponentDiff?: BaselineHistoryDiffLoader;
  compareImages?: ImageComparisonRunner;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [response, setResponse] = useState<BaselineHistoryResponse | null>(
    null,
  );
  const [entries, setEntries] = useState<BaselineHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<DiffResultData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [componentDiff, setComponentDiff] =
    useState<BaselineHistoryDiffResponse | null>(null);
  const [componentDiffLoading, setComponentDiffLoading] = useState(false);
  const [componentDiffError, setComponentDiffError] = useState<string | null>(
    null,
  );

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () =>
      setCompact(element.getBoundingClientRect().width < 720);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    setEntries([]);
    setResponse(null);
    void loadHistory({ path: target.path, signal: abort.signal })
      .then((next) => {
        const defaults = chooseDefaults(next.entries);
        setResponse(next);
        setEntries(next.entries);
        setNextCursor(next.nextCursor);
        setBeforeId(defaults.before);
        setAfterId(defaults.after);
      })
      .catch((reason) => {
        if (!abort.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load baseline history",
          );
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [loadHistory, target.path]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await loadHistory({
        path: target.path,
        cursor: nextCursor,
      });
      setEntries((current) => {
        const known = new Set(current.map((entry) => entry.revisionId));
        return [
          ...current,
          ...next.entries.filter((entry) => !known.has(entry.revisionId)),
        ];
      });
      setNextCursor(next.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load more history",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [loadHistory, loadingMore, nextCursor, target.path]);

  const before = useMemo(
    () => entries.find((entry) => entry.revisionId === beforeId) ?? null,
    [beforeId, entries],
  );
  const after = useMemo(
    () => entries.find((entry) => entry.revisionId === afterId) ?? null,
    [afterId, entries],
  );

  useEffect(() => {
    if (!before || !after) {
      setComparison(null);
      setComparisonError(null);
      return;
    }
    let cancelled = false;
    setComparisonLoading(true);
    setComparisonError(null);
    setComparison(null);
    void compareImages(before.imageUrl, after.imageUrl, {
      pixelThreshold: DEFAULT_DIFF_THRESHOLD,
      includeAntiAliasing: false,
      passThresholdPercent: DEFAULT_PASS_THRESHOLD_PERCENT,
      deviceScaleFactor: VISUAL_DEVICE_SCALE_FACTOR,
    })
      .then((result) => {
        if (!cancelled) setComparison(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setComparisonError(
            reason instanceof Error
              ? reason.message
              : "Unable to compare baseline revisions",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setComparisonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [after, before, compareImages]);

  useEffect(() => {
    if (!before || !after) {
      setComponentDiff(null);
      setComponentDiffError(null);
      return;
    }
    const abort = new AbortController();
    setComponentDiffLoading(true);
    setComponentDiffError(null);
    setComponentDiff(null);
    void loadComponentDiff({
      path: target.path,
      beforeRevisionId: before.revisionId,
      afterRevisionId: after.revisionId,
      componentPath: target.componentPath,
      signal: abort.signal,
    })
      .then(setComponentDiff)
      .catch((reason) => {
        if (!abort.signal.aborted) {
          setComponentDiffError(
            reason instanceof Error
              ? reason.message
              : "Unable to compare component revisions",
          );
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setComponentDiffLoading(false);
      });
    return () => abort.abort();
  }, [after, before, loadComponentDiff, target.componentPath, target.path]);

  return (
    <Root
      ref={rootRef}
      aria-label={`${target.label} baseline history`}
      data-layout={compact ? "stacked" : "split"}
    >
      <Header>
        <Button
          size="small"
          variant="ghost"
          padding="small"
          ariaLabel="Back to baseline"
          title="Back to baseline"
          onClick={onClose}
        >
          <ArrowLeftIcon />
        </Button>
        <HeaderText>
          <Title>{target.label} history</Title>
          <Subtitle>{target.path}</Subtitle>
        </HeaderText>
        {response ? (
          <VcsBadge title={`History provided by ${response.vcs}`}>
            <CommitIcon />
            {response.vcs}
          </VcsBadge>
        ) : null}
      </Header>
      {loading ? <State role="status">Loading baseline history…</State> : null}
      {!loading && error && entries.length === 0 ? (
        <State role="alert">{error}</State>
      ) : null}
      {!loading && !error && entries.length === 0 ? (
        <State>No committed baseline versions were found.</State>
      ) : null}
      {!loading && entries.length > 0 ? (
        <HistoryContent>
          <Workspace $compact={compact}>
            <Timeline aria-label="Baseline revisions">
              <TimelineHeader>
                <span>Revision</span>
                <span>Before</span>
                <span>After</span>
              </TimelineHeader>
              {entries.map((entry) => (
                <TimelineRow
                  key={entry.revisionId}
                  $working={entry.source === "working-copy"}
                >
                  <RevisionMeta>
                    <RevisionTitle title={entry.subject}>
                      {entry.subject}
                    </RevisionTitle>
                    <RevisionLine>
                      <Id>{entry.displayId}</Id>
                      {entry.secondaryId ? (
                        <>
                          {" "}
                          · commit <Id>{entry.secondaryId}</Id>
                        </>
                      ) : null}
                    </RevisionLine>
                    <RevisionLine>
                      {entry.author} · {formatDate(entry.authoredAt)}
                    </RevisionLine>
                  </RevisionMeta>
                  <RadioCell title={`Use ${entry.subject} as Before`}>
                    <input
                      type="radio"
                      name="visual-delta-history-before"
                      aria-label={`Use ${entry.subject} as Before`}
                      checked={beforeId === entry.revisionId}
                      onChange={() => setBeforeId(entry.revisionId)}
                    />
                  </RadioCell>
                  <RadioCell title={`Use ${entry.subject} as After`}>
                    <input
                      type="radio"
                      name="visual-delta-history-after"
                      aria-label={`Use ${entry.subject} as After`}
                      checked={afterId === entry.revisionId}
                      onChange={() => setAfterId(entry.revisionId)}
                    />
                  </RadioCell>
                </TimelineRow>
              ))}
              {nextCursor ? (
                <div style={{ padding: 10 }}>
                  <Button
                    size="small"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    ariaLabel="Load more baseline history"
                  >
                    <SyncIcon />
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
              {error ? <State role="alert">{error}</State> : null}
              {response && !response.followsRenames ? (
                <State>
                  JJ history follows this exact baseline path; versions before a
                  rename may not appear.
                </State>
              ) : null}
              {response?.warnings?.map((warning) => (
                <State key={warning} role="note">
                  {warning}
                </State>
              ))}
            </Timeline>
            <CompareWorkspace aria-label="Selected baseline revisions">
              {before && after ? (
                <>
                  <SelectionHeader>
                    <SelectionCard>
                      <SelectionLabel>Before</SelectionLabel>
                      <RevisionTitle>{before.subject}</RevisionTitle>
                      <RevisionLine>{before.displayId}</RevisionLine>
                    </SelectionCard>
                    <SelectionCard>
                      <SelectionLabel>After</SelectionLabel>
                      <RevisionTitle>{after.subject}</RevisionTitle>
                      <RevisionLine>{after.displayId}</RevisionLine>
                    </SelectionCard>
                  </SelectionHeader>
                  <ComparisonSurface>
                    {comparisonLoading ? (
                      <State role="status">Comparing revisions…</State>
                    ) : null}
                    {comparisonError ? (
                      <State role="alert">{comparisonError}</State>
                    ) : null}
                    {comparison ? (
                      <DiffResult result={comparison} defaultZoom="100%" />
                    ) : null}
                  </ComparisonSurface>
                  <details>
                    <summary>After revision message</summary>
                    <Message>{after.message || after.subject}</Message>
                  </details>
                </>
              ) : (
                <State>Select Before and After revisions to compare.</State>
              )}
            </CompareWorkspace>
          </Workspace>
          {componentDiffLoading ? (
            <ComponentDiffSection aria-label="Component diff">
              <ComponentDiffTitle>Component diff</ComponentDiffTitle>
              <ComponentDiffState role="status">
                Comparing component source…
              </ComponentDiffState>
            </ComponentDiffSection>
          ) : null}
          {componentDiffError ? (
            <ComponentDiffSection aria-label="Component diff">
              <ComponentDiffTitle>Component diff</ComponentDiffTitle>
              <ComponentDiffState role="alert">
                {componentDiffError}
              </ComponentDiffState>
            </ComponentDiffSection>
          ) : null}
          {componentDiff ? (
            <ComponentSourceDiff result={componentDiff} />
          ) : null}
        </HistoryContent>
      ) : null}
    </Root>
  );
}
