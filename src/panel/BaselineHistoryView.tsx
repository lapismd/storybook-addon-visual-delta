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
  type BaselineHistoryEntry,
  type BaselineHistoryResponse,
} from "../shared/baseline-history.js";
import { panelCanvasBackground } from "./styled.js";

export type BaselineHistoryTarget = {
  path: string;
  label: string;
};

export type BaselineHistoryLoader = typeof fetchBaselineHistory;

const Root = styled.section(({ theme }) => ({
  flex: "1 1 auto",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
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

const Workspace = styled.div<{ $compact: boolean }>(({ $compact }) => ({
  flex: "1 1 auto",
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: $compact
    ? "minmax(0, 1fr)"
    : "minmax(260px, 340px) minmax(0, 1fr)",
  gridTemplateRows: $compact
    ? "minmax(190px, 42%) minmax(240px, 1fr)"
    : "minmax(0, 1fr)",
}));

const Timeline = styled.div(({ theme }) => ({
  minHeight: 0,
  overflow: "auto",
  borderRight: `1px solid ${theme.appBorderColor}`,
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const TimelineHeader = styled.div(({ theme }) => ({
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 42px 42px",
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
}));

const TimelineRow = styled.div<{ $working: boolean }>(
  ({ theme, $working }) => ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 42px 42px",
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
  color: theme.color.secondary,
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
  overflow: "auto",
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

const PreviewGrid = styled.div({
  flex: "1 1 auto",
  minHeight: 180,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
});

const PreviewCard = styled.figure(({ theme }) => ({
  minWidth: 0,
  minHeight: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 4,
  overflow: "hidden",
  background: theme.background.app,
}));

const PreviewImage = styled.img({
  flex: "1 1 auto",
  minHeight: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
});

const PreviewCaption = styled.figcaption(({ theme }) => ({
  flex: "0 0 auto",
  padding: "5px 8px",
  borderTop: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
  color: theme.color.defaultText,
  fontSize: 11,
  fontWeight: 700,
}));

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
}: {
  target: BaselineHistoryTarget;
  onClose: () => void;
  loadHistory?: BaselineHistoryLoader;
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
                <PreviewGrid>
                  <PreviewCard>
                    <PreviewImage
                      src={before.imageUrl}
                      alt={`Before: ${before.subject}`}
                    />
                    <PreviewCaption>Before</PreviewCaption>
                  </PreviewCard>
                  <PreviewCard>
                    <PreviewImage
                      src={after.imageUrl}
                      alt={`After: ${after.subject}`}
                    />
                    <PreviewCaption>After</PreviewCaption>
                  </PreviewCard>
                </PreviewGrid>
                <Message>{after.message || after.subject}</Message>
              </>
            ) : (
              <State>Select Before and After revisions to compare.</State>
            )}
          </CompareWorkspace>
        </Workspace>
      ) : null}
    </Root>
  );
}
