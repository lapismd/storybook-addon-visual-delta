import React, { useMemo, type ReactNode } from "react";
import { addons, type HashEntry } from "storybook/manager-api";
import { styled } from "storybook/theming";
import {
  SKIP_VISUAL_TAG,
  VISUAL_REVIEW_APPROVED_TAG,
  VISUAL_REVIEW_FAILED_TAG,
  VISUAL_REVIEW_PENDING_TAG,
  VISUAL_REVIEW_READY_TAG,
} from "../constants.js";

type VisualSidebarStatus = "skip" | "failed" | "ready" | "pending" | "approved";

type VisualSidebarBadge = {
  status: VisualSidebarStatus;
  tag: string;
  glyph: string;
  label: string;
  title: string;
  background: string;
  border: string;
};

const VISUAL_SIDEBAR_BADGES: readonly VisualSidebarBadge[] = [
  {
    status: "skip",
    tag: SKIP_VISUAL_TAG,
    glyph: "⊘",
    label: "Skip visual",
    title: "Excluded from Visual Delta tests",
    background: "#a66707",
    border: "#734603",
  },
  {
    status: "failed",
    tag: VISUAL_REVIEW_FAILED_TAG,
    glyph: "✕",
    label: "Failed",
    title: "Visual baseline failed or was rejected",
    background: "#c52020",
    border: "#8a1414",
  },
  {
    status: "ready",
    tag: VISUAL_REVIEW_READY_TAG,
    glyph: "⚑",
    label: "Ready",
    title: "Visual baseline is ready for review",
    background: "#157dac",
    border: "#0a5070",
  },
  {
    status: "pending",
    tag: VISUAL_REVIEW_PENDING_TAG,
    glyph: "⏱",
    label: "Pending review",
    title: "Visual baseline is awaiting review",
    background: "#c2540a",
    border: "#8a3a05",
  },
  {
    status: "approved",
    tag: VISUAL_REVIEW_APPROVED_TAG,
    glyph: "⛨",
    label: "Approved",
    title: "Visual baseline has been reviewed and accepted",
    background: "#15843e",
    border: "#0c5a29",
  },
] as const;

/**
 * Resolve malformed multi-tag source deterministically. Storybook already
 * supplies inherited tags on component/group entries, so the same resolver
 * covers both leaves and ancestors.
 */
export function visualSidebarBadgeFromTags(
  tags: readonly string[] | undefined,
): VisualSidebarBadge | null {
  if (!tags?.length) return null;
  return (
    VISUAL_SIDEBAR_BADGES.find((badge) => tags.includes(badge.tag)) ?? null
  );
}

const STATUS_SLOT_PX = 28;
const STATUS_GAP_PX = 8;
const BADGE_SIZE_PX = 18;
const TRAILING_RESERVE_PX = BADGE_SIZE_PX + STATUS_GAP_PX + STATUS_SLOT_PX + 6;

const Row = styled.div({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  alignItems: "center",
  width: "100%",
  minWidth: 0,
  paddingRight: TRAILING_RESERVE_PX,
  boxSizing: "border-box",
});

const Label = styled.div({
  display: "flex",
  alignItems: "center",
  minHeight: 19,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const Badge = styled.span(({ theme }) => ({
  position: "absolute",
  right: STATUS_SLOT_PX + STATUS_GAP_PX,
  top: "50%",
  transform: "translateY(-50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: BADGE_SIZE_PX,
  height: BADGE_SIZE_PX,
  minWidth: BADGE_SIZE_PX,
  padding: 0,
  borderRadius: "50%",
  border: "1px solid transparent",
  boxSizing: "border-box",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: `0 0 0 1.5px ${
    theme?.base === "dark"
      ? (theme?.background?.content ?? "#1b1c1d")
      : (theme?.background?.app ?? "#f6f9fc")
  }`,
}));

function VisualStatusSidebarLabel({ item }: { item: HashEntry }) {
  const badge = useMemo(
    () => visualSidebarBadgeFromTags(item.tags),
    [item.tags],
  );

  return (
    <Row>
      <Label>{item.name}</Label>
      {badge ? (
        <Badge
          aria-label={`${badge.label}: ${badge.title}`}
          data-tag={badge.tag}
          title={badge.title}
          style={{
            backgroundColor: badge.background,
            borderColor: badge.border,
          }}
        >
          {badge.glyph}
        </Badge>
      ) : null}
    </Row>
  );
}

export function renderVisualStatusSidebarLabel(
  item: HashEntry,
): ReactNode | undefined {
  if (
    item.type !== "story" &&
    item.type !== "group" &&
    item.type !== "docs" &&
    item.type !== "component"
  ) {
    return undefined;
  }
  return <VisualStatusSidebarLabel item={item} />;
}

export function installVisualStatusSidebarLabels() {
  addons.setConfig({
    sidebar: {
      ...addons.getConfig()?.sidebar,
      renderLabel: renderVisualStatusSidebarLabel,
    },
  });
}
