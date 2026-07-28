import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, CommitIcon, SyncIcon } from "@storybook/icons";
import { Button } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  commitVisualDeltaChangeSet,
  fetchVisualDeltaChangeSets,
  type VisualDeltaChangeFile,
  type VisualDeltaChangeSet,
  type VisualDeltaChangeSetsResponse,
} from "../shared/change-sets.js";
import { panelCanvasBackground } from "./styled.js";

const Root = styled.section(({ theme }) => ({
  display: "flex",
  flex: "1 1 auto",
  minHeight: 0,
  height: "100%",
  flexDirection: "column",
  overflow: "hidden",
  background: panelCanvasBackground(theme),
}));

const Header = styled.header(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  padding: "6px 12px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const HeaderCopy = styled.div({
  display: "flex",
  minWidth: 0,
  flex: 1,
  flexDirection: "column",
  gap: 1,
});

const Title = styled.h2(({ theme }) => ({
  margin: 0,
  color: theme.color.defaultText,
  fontSize: theme.typography.size.s2,
  fontWeight: theme.typography.weight.bold,
}));

const Subtitle = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: 10,
}));

const Workspace = styled.div({
  display: "grid",
  gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)",
  flex: "1 1 auto",
  minHeight: 0,
});

const Sidebar = styled.aside(({ theme }) => ({
  minHeight: 0,
  overflow: "auto",
  borderRight: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const SidebarTitle = styled.div(({ theme }) => ({
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: "8px 10px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
  color: theme.textMutedColor,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}));

const ChangeSetButton = styled.button<{ $selected: boolean }>(
  ({ theme, $selected }) => ({
    appearance: "none",
    width: "100%",
    padding: "10px",
    border: 0,
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: $selected ? theme.background.hoverable : "transparent",
    color: theme.color.defaultText,
    cursor: "pointer",
    textAlign: "left",
  }),
);

const ChangeSetTitle = styled.strong({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11,
});

const ChangeSetMeta = styled.span(({ theme }) => ({
  display: "block",
  marginTop: 4,
  color: theme.textMutedColor,
  fontSize: 10,
}));

const StateBadge = styled.span<{ $state: VisualDeltaChangeSet["state"] }>(
  ({ theme, $state }) => ({
    display: "inline-flex",
    marginTop: 6,
    padding: "2px 6px",
    borderRadius: 999,
    background:
      $state === "committed"
        ? `color-mix(in srgb, ${theme.color.positive} 14%, transparent)`
        : $state === "pending"
          ? `color-mix(in srgb, ${theme.color.secondary} 14%, transparent)`
          : `color-mix(in srgb, ${theme.color.negative} 14%, transparent)`,
    color:
      $state === "committed"
        ? theme.color.positive
        : $state === "pending"
          ? theme.color.secondary
          : theme.color.negative,
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
  }),
);

const Detail = styled.div({
  display: "flex",
  minWidth: 0,
  minHeight: 0,
  flexDirection: "column",
});

const DetailHeader = styled.div(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: 10,
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

const MessageInput = styled.input(({ theme }) => ({
  flex: "1 1 280px",
  minWidth: 160,
  padding: "6px 8px",
  border: `1px solid ${theme.input.border}`,
  borderRadius: theme.input.borderRadius,
  background: theme.input.background,
  color: theme.input.color,
  font: "inherit",
}));

const DetailBody = styled.div({
  display: "grid",
  gridTemplateColumns: "minmax(210px, 280px) minmax(0, 1fr)",
  flex: "1 1 auto",
  minHeight: 0,
});

const Operations = styled.ul(({ theme }) => ({
  display: "grid",
  gap: 4,
  margin: 0,
  padding: "8px 14px 9px 30px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
  color: theme.textMutedColor,
  fontSize: 10,
  "& strong": {
    color: theme.color.defaultText,
  },
}));

const FileList = styled.div(({ theme }) => ({
  minHeight: 0,
  overflow: "auto",
  borderRight: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
}));

const FileButton = styled.button<{ $selected: boolean }>(
  ({ theme, $selected }) => ({
    appearance: "none",
    display: "flex",
    width: "100%",
    alignItems: "flex-start",
    gap: 7,
    padding: "8px 10px",
    border: 0,
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: $selected ? theme.background.hoverable : "transparent",
    color: theme.color.defaultText,
    cursor: "pointer",
    textAlign: "left",
  }),
);

const FileCode = styled.code(({ theme }) => ({
  minWidth: 0,
  overflowWrap: "anywhere",
  color: theme.color.defaultText,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
}));

const FileStatus = styled.span(({ theme }) => ({
  flex: "0 0 auto",
  color: theme.textMutedColor,
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
}));

const Preview = styled.div({
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  padding: 12,
});

const Warning = styled.div(({ theme }) => ({
  margin: "0 0 10px",
  padding: "8px 10px",
  border: `1px solid color-mix(in srgb, ${theme.color.negative} 42%, ${theme.appBorderColor})`,
  borderRadius: 4,
  background: `color-mix(in srgb, ${theme.color.negative} 8%, ${theme.background.content})`,
  color: theme.color.defaultText,
  fontSize: 11,
  lineHeight: 1.4,
}));

const OutcomeNotice = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 16px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.hoverable,
  color: theme.color.defaultText,
  fontSize: theme.typography.size.s1,
}));

const Empty = styled.div(({ theme }) => ({
  display: "flex",
  flex: "1 1 auto",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  color: theme.textMutedColor,
  textAlign: "center",
}));

const Patch = styled.pre(({ theme }) => ({
  margin: 0,
  padding: 12,
  overflow: "auto",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 5,
  background: theme.background.content,
  color: theme.color.defaultText,
  fontFamily: theme.typography.fonts.mono,
  fontSize: 10,
  lineHeight: 1.45,
  whiteSpace: "pre",
}));

const ImageGrid = styled.div({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
});

const ImageCard = styled.figure(({ theme }) => ({
  minWidth: 0,
  margin: 0,
  padding: 8,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: 5,
  background: theme.background.content,
}));

const ImageLabel = styled.figcaption(({ theme }) => ({
  marginBottom: 7,
  color: theme.textMutedColor,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
}));

const ImageSurface = styled.div(({ theme }) => ({
  position: "relative",
  minHeight: 120,
  overflow: "auto",
  backgroundImage:
    theme.base === "light"
      ? "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)"
      : "linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
  "& img": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
  },
}));

function actionLabel(changeSet: VisualDeltaChangeSet): string {
  const operation = changeSet.operations.at(-1);
  return operation
    ? `${operation.action.replaceAll("-", " ")} · ${operation.scope}`
    : "Visual Delta changes";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : value;
}

function simpleUnifiedPatch(
  relativePath: string,
  before: string,
  after: string,
): string {
  if (before === after) return "No textual changes.";
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const contextStart = Math.max(0, prefix - 3);
  const beforeEnd = Math.min(
    beforeLines.length,
    beforeLines.length - suffix + 3,
  );
  const afterEnd = Math.min(afterLines.length, afterLines.length - suffix + 3);
  const lines = [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -${contextStart + 1},${beforeEnd - contextStart} +${contextStart + 1},${afterEnd - contextStart} @@`,
  ];
  for (let index = contextStart; index < prefix; index += 1) {
    lines.push(` ${beforeLines[index] ?? ""}`);
  }
  for (let index = prefix; index < beforeLines.length - suffix; index += 1) {
    lines.push(`-${beforeLines[index] ?? ""}`);
  }
  for (let index = prefix; index < afterLines.length - suffix; index += 1) {
    lines.push(`+${afterLines[index] ?? ""}`);
  }
  for (
    let index = Math.max(prefix, afterLines.length - suffix);
    index < afterEnd;
    index += 1
  ) {
    lines.push(` ${afterLines[index] ?? ""}`);
  }
  return lines.join("\n");
}

function TextFilePreview({ file }: { file: VisualDeltaChangeFile }) {
  const [patch, setPatch] = useState("Loading diff…");
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      file.beforeUrl
        ? fetch(file.beforeUrl).then((response) => response.text())
        : Promise.resolve(""),
      file.afterUrl
        ? fetch(file.afterUrl).then((response) => response.text())
        : Promise.resolve(""),
    ])
      .then(([before, after]) => {
        if (!cancelled) setPatch(simpleUnifiedPatch(file.path, before, after));
      })
      .catch((error) => {
        if (!cancelled) {
          setPatch(error instanceof Error ? error.message : "Diff unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file.afterUrl, file.beforeUrl, file.path]);
  return <Patch aria-label={`Diff for ${file.path}`}>{patch}</Patch>;
}

function ImageFilePreview({ file }: { file: VisualDeltaChangeFile }) {
  return (
    <ImageGrid>
      <ImageCard>
        <ImageLabel>Before</ImageLabel>
        <ImageSurface>
          {file.beforeUrl ? (
            <img src={file.beforeUrl} alt={`Before ${file.path}`} />
          ) : (
            <Empty>No previous image</Empty>
          )}
        </ImageSurface>
      </ImageCard>
      <ImageCard>
        <ImageLabel>After</ImageLabel>
        <ImageSurface>
          {file.afterUrl ? (
            <img src={file.afterUrl} alt={`After ${file.path}`} />
          ) : (
            <Empty>Image deleted</Empty>
          )}
        </ImageSurface>
      </ImageCard>
      {file.beforeUrl && file.afterUrl ? (
        <ImageCard>
          <ImageLabel>Overlay difference</ImageLabel>
          <ImageSurface>
            <img src={file.afterUrl} alt="" />
            <img
              src={file.beforeUrl}
              alt={`Overlay difference for ${file.path}`}
              style={{ position: "absolute", inset: 0, opacity: 0.5 }}
            />
          </ImageSurface>
        </ImageCard>
      ) : null}
    </ImageGrid>
  );
}

export function ChangeSetOutcomeNotice({
  message,
  error = false,
  onOpen,
}: {
  message: string;
  error?: boolean;
  onOpen: () => void;
}) {
  return (
    <OutcomeNotice role={error ? "alert" : "status"}>
      <span>{message}</span>
      <Button
        size="small"
        variant="outline"
        ariaLabel="Open Visual Delta changes"
        onClick={onOpen}
      >
        Open Changes
      </Button>
    </OutcomeNotice>
  );
}

export function ChangeSetsView({
  onClose,
  onUpdated,
  loadChangeSets = fetchVisualDeltaChangeSets,
  commitChangeSet = commitVisualDeltaChangeSet,
}: {
  onClose: () => void;
  onUpdated?: (response: VisualDeltaChangeSetsResponse) => void;
  loadChangeSets?: typeof fetchVisualDeltaChangeSets;
  commitChangeSet?: typeof commitVisualDeltaChangeSet;
}) {
  const [response, setResponse] =
    useState<VisualDeltaChangeSetsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadChangeSets();
      setResponse(next);
      onUpdated?.(next);
      setSelectedId((current) =>
        current && next.changeSets.some((item) => item.id === current)
          ? current
          : (next.changeSets[0]?.id ?? null),
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load Visual Delta changes",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const selected = useMemo(
    () => response?.changeSets.find((item) => item.id === selectedId) ?? null,
    [response, selectedId],
  );
  const file = useMemo(
    () =>
      selected?.files.find((item) => item.path === selectedPath) ??
      selected?.files[0] ??
      null,
    [selected, selectedPath],
  );
  useEffect(() => {
    setMessage(selected?.message ?? "");
    setSelectedPath(selected?.files[0]?.path ?? null);
  }, [selected?.id]);

  const handleCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setError(null);
    try {
      await commitChangeSet({
        changeSetId: selected.id,
        message,
      });
      await reload();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Commit failed",
      );
      await reload();
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Root>
      <Header>
        <Button size="small" ariaLabel="Back to Visual Delta" onClick={onClose}>
          <ArrowLeftIcon />
          Back
        </Button>
        <HeaderCopy>
          <Title>Changes</Title>
          <Subtitle>
            {response
              ? `${response.pendingCount} pending Visual Delta change set${response.pendingCount === 1 ? "" : "s"}`
              : "Review files changed by Visual Delta"}
          </Subtitle>
        </HeaderCopy>
        <Button
          size="small"
          ariaLabel="Refresh Visual Delta changes"
          disabled={loading}
          onClick={() => void reload()}
        >
          <SyncIcon />
          Refresh
        </Button>
      </Header>
      {error ? <Warning role="alert">{error}</Warning> : null}
      {loading && !response ? (
        <Empty role="status">Loading Visual Delta changes…</Empty>
      ) : !response?.changeSets.length ? (
        <Empty>No Visual Delta file changes have been recorded.</Empty>
      ) : (
        <Workspace>
          <Sidebar>
            <SidebarTitle>Change sets</SidebarTitle>
            {response.changeSets.map((changeSet) => (
              <ChangeSetButton
                key={changeSet.id}
                type="button"
                $selected={changeSet.id === selected?.id}
                onClick={() => setSelectedId(changeSet.id)}
              >
                <ChangeSetTitle>{actionLabel(changeSet)}</ChangeSetTitle>
                <ChangeSetMeta>
                  {changeSet.files.length} file
                  {changeSet.files.length === 1 ? "" : "s"} ·{" "}
                  {formatDate(changeSet.updatedAt)}
                </ChangeSetMeta>
                <StateBadge $state={changeSet.state}>
                  {changeSet.state}
                </StateBadge>
              </ChangeSetButton>
            ))}
          </Sidebar>
          {selected ? (
            <Detail>
              <DetailHeader>
                <MessageInput
                  aria-label="Visual Delta commit message"
                  value={message}
                  disabled={selected.state === "committed"}
                  onChange={(event) => setMessage(event.currentTarget.value)}
                />
                <Button
                  size="small"
                  variant="solid"
                  ariaLabel="Commit Visual Delta change set"
                  disabled={
                    !selected.commitAllowed || !message.trim() || committing
                  }
                  onClick={() => void handleCommit()}
                >
                  <CommitIcon />
                  {committing ? "Committing…" : "Commit change set"}
                </Button>
              </DetailHeader>
              {selected.commit ? (
                <Warning role="status">
                  Committed as {selected.commit.vcs.toUpperCase()}{" "}
                  {selected.commit.displayId}: {selected.commit.message}
                </Warning>
              ) : null}
              {selected.commitError ? (
                <Warning role="alert">
                  Commit failed: {selected.commitError}
                </Warning>
              ) : null}
              {selected.blockReasons.map((reason) => (
                <Warning key={reason} role="alert">
                  {reason}
                </Warning>
              ))}
              {!selected.commitAllowed &&
              selected.state === "pending" &&
              selected.mode === "off" ? (
                <Warning>
                  VCS workflow is off for this change set. Enable Review or Auto
                  in Configuration → Workflow for future changes.
                </Warning>
              ) : null}
              {!selected.commitAllowed &&
              selected.state === "pending" &&
              selected.mode !== "off" &&
              !selected.vcs ? (
                <Warning>
                  No Git or Jujutsu repository is available for this change set.
                </Warning>
              ) : null}
              {!selected.commitAllowed &&
              selected.state === "pending" &&
              selected.mode !== "off" &&
              selected.vcs ? (
                <Warning>
                  VCS writes are disabled by the Storybook host. Set
                  allowVcsWrites to enable commits.
                </Warning>
              ) : null}
              <Operations aria-label="Visual Delta operations">
                {selected.operations.map((operation) => (
                  <li key={operation.id}>
                    <strong>{operation.action.replaceAll("-", " ")}</strong>
                    {" · "}
                    {operation.scope}
                    {operation.storyIds.length
                      ? ` · ${operation.storyIds.join(", ")}`
                      : ""}
                    {operation.error ? ` · ${operation.error}` : ""}
                  </li>
                ))}
              </Operations>
              <DetailBody>
                <FileList aria-label="Changed files">
                  {selected.files.map((item) => (
                    <FileButton
                      key={item.path}
                      type="button"
                      $selected={item.path === file?.path}
                      onClick={() => setSelectedPath(item.path)}
                    >
                      <FileStatus>{item.change}</FileStatus>
                      <FileCode>{item.path}</FileCode>
                    </FileButton>
                  ))}
                </FileList>
                <Preview>
                  {file?.unsafeReason ? (
                    <Warning role="alert">{file.unsafeReason}</Warning>
                  ) : null}
                  {file ? (
                    file.image ? (
                      <ImageFilePreview file={file} />
                    ) : file.binary ? (
                      <Warning>
                        Binary file preview is unavailable for {file.path}.
                      </Warning>
                    ) : (
                      <TextFilePreview file={file} />
                    )
                  ) : (
                    <Empty>Select a changed file.</Empty>
                  )}
                </Preview>
              </DetailBody>
            </Detail>
          ) : null}
        </Workspace>
      )}
    </Root>
  );
}
