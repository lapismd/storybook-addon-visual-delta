import React, { useMemo, useState } from "react";
import type { PlacementMode, VisualDeltaImage } from "../constants.js";
import { BaselineAccordion } from "../panel/BaselineAccordion.js";
import { BaselineHistoryView } from "../panel/BaselineHistoryView.js";
import { ImageGallery } from "../panel/ImageGallery.js";
import { LiveVisibilityToggle } from "../panel/LiveVisibilityToggle.js";
import { PlacementPad } from "../panel/PlacementPad.js";
import { ReviewStatusPad } from "../panel/ReviewStatusPad.js";
import { VisualStatusBadge } from "../panel/VisualStatusBadge.js";
import { placementToggleAction } from "../shared/overlay-session.js";
import { FormPlaceholder } from "./FormPlaceholder.js";

const SAMPLE_IMAGES: VisualDeltaImage[] = [
  {
    src:
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><rect width="120" height="48" fill="#5c6bc0"/><text x="12" y="30" fill="#fff" font-size="14">A</text></svg>`,
      ),
    offsetX: 0,
    offsetY: 0,
    align: "canvas",
    placement: "center",
  },
  {
    src:
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><rect width="120" height="48" fill="#00897b"/><text x="12" y="30" fill="#fff" font-size="14">B</text></svg>`,
      ),
    offsetX: 0,
    offsetY: 0,
    align: "canvas",
    placement: "center",
  },
];

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
};

const metaStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  color: "#333",
};

/** Placement pad with soft-hide session semantics (matches live panel). */
export function PlacementPadFixture() {
  const [placement, setPlacement] = useState<PlacementMode>("right");
  const [overlayOn, setOverlayOn] = useState(true);
  const [index, setIndex] = useState(0);

  return (
    <div data-testid="placement-pad-fixture" style={rowStyle}>
      <PlacementPad
        value={placement}
        active={overlayOn}
        onToggle={(next) => {
          const action = placementToggleAction(
            {
              overlayOn,
              placement,
              index,
              imageCount: 1,
              opacity: 1,
            },
            next,
          );
          if (action.type === "soft-hide") {
            setOverlayOn(false);
            return;
          }
          setOverlayOn(true);
          setPlacement(action.placement);
          setIndex(action.index);
        }}
      />
      <div style={metaStyle}>
        <div data-testid="fixture-placement">{placement}</div>
        <div data-testid="fixture-overlay-on">{String(overlayOn)}</div>
        <div data-testid="fixture-index">{index}</div>
      </div>
    </div>
  );
}

export function LiveVisibilityFixture() {
  const [liveVisible, setLiveVisible] = useState(true);
  return (
    <div data-testid="live-visibility-fixture" style={rowStyle}>
      <LiveVisibilityToggle
        liveVisible={liveVisible}
        onToggle={setLiveVisible}
      />
      <span data-testid="fixture-live-visible" style={metaStyle}>
        {String(liveVisible)}
      </span>
    </div>
  );
}

export function ReviewStatusFixture() {
  const [value, setValue] = useState<
    "pending" | "approved" | "ready" | "failed" | null
  >(null);
  return (
    <div data-testid="review-status-fixture" style={rowStyle}>
      <ReviewStatusPad value={value} onSelect={setValue} />
      <span data-testid="fixture-review-status" style={metaStyle}>
        {value ?? "none"}
      </span>
    </div>
  );
}

export function StatusBadgeFixture() {
  return (
    <div data-testid="status-badge-fixture" style={rowStyle}>
      <VisualStatusBadge status="pass" />
      <VisualStatusBadge status="fail" />
    </div>
  );
}

export function ImageGalleryFixture() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  return (
    <div data-testid="image-gallery-fixture">
      <ImageGallery
        images={SAMPLE_IMAGES}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />
      <div data-testid="fixture-gallery-index" style={metaStyle}>
        {selectedIndex}
      </div>
    </div>
  );
}

export function BaselineAccordionFixture() {
  const [expandedId, setExpandedId] = useState<"default" | string | null>(
    "default",
  );
  const [showDistribution, setShowDistribution] = useState(false);
  const [historyOpened, setHistoryOpened] = useState("none");
  const sections = useMemo(
    () => [
      {
        id: "default" as const,
        label: "Default",
        hint: "End of play · primary baseline",
        thumbSrc: SAMPLE_IMAGES[0]?.src,
        status: "pass" as const,
        stats: "0.0000% · 0/100 px · <1%",
        history: {
          path: "forms/entry-actions/single-entry-chromium-darwin.png",
          label: "Default",
        },
      },
      {
        id: "opens-chooser",
        label: "Opens chooser",
        hint: "No baseline yet · opens-chooser",
        step: {
          callId: "call-1",
          label: "Opens chooser",
          stepId: "opens-chooser",
        },
      },
    ],
    [],
  );

  return (
    <div data-testid="baseline-accordion-fixture">
      <BaselineAccordion
        sections={sections}
        expandedId={expandedId}
        busy={false}
        showDistribution={showDistribution}
        onExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        onCreate={() => undefined}
        onUpdate={() => undefined}
        onUpdateDefault={() => undefined}
        onToggleDistribution={() => setShowDistribution((v) => !v)}
        onOpenHistory={(target) => setHistoryOpened(target.label)}
        renderBody={(section) => (
          <FormPlaceholder data-testid={`fixture-section-body-${section.id}`}>
            Body for {section.label}
          </FormPlaceholder>
        )}
      />
      <div data-testid="fixture-expanded-id" style={metaStyle}>
        {expandedId ?? "none"}
      </div>
      <div data-testid="fixture-history-opened" style={metaStyle}>
        {historyOpened}
      </div>
    </div>
  );
}

export function BaselineHistoryViewFixture() {
  const oldImage =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="220"><rect width="440" height="220" fill="#f6f7fb"/><rect x="45" y="45" width="350" height="130" rx="12" fill="#5c6bc0"/><text x="75" y="120" fill="#fff" font-size="24">Original baseline</text></svg>`,
    );
  const newImage =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="220"><rect width="440" height="220" fill="#f6f7fb"/><rect x="65" y="45" width="330" height="130" rx="18" fill="#00897b"/><text x="95" y="120" fill="#fff" font-size="24">Updated baseline</text></svg>`,
    );
  return (
    <div style={{ height: 760, position: "relative" }}>
      <BaselineHistoryView
        target={{
          path: "forms/entry-actions/single-entry-chromium-darwin.png",
          label: "Default",
          componentPath:
            "src/shared/forms/entry-actions/EntryActions.stories.svelte",
        }}
        onClose={() => undefined}
        loadHistory={async ({ cursor }) => ({
          ok: true,
          vcs: "jj",
          followsRenames: false,
          entries: cursor
            ? [
                {
                  revisionId: "c".repeat(40),
                  displayId: "qpvuntsmznwk",
                  secondaryId: "cccccccccccc",
                  subject: "Create entry actions baseline",
                  message: "Create entry actions baseline",
                  author: "Steve Juma",
                  authoredAt: "2026-07-20T09:15:00Z",
                  source: "commit",
                  imageUrl: oldImage,
                },
              ]
            : [
                {
                  revisionId: "working-copy",
                  displayId: "Working copy",
                  subject: "Uncommitted baseline",
                  message: "Current baseline bytes from the working directory.",
                  author: "Local workspace",
                  authoredAt: "2026-07-26T17:45:00Z",
                  source: "working-copy",
                  imageUrl: newImage,
                },
                {
                  revisionId: "a".repeat(40),
                  displayId: "kmrusxzponml",
                  secondaryId: "aaaaaaaaaaaa",
                  subject: "Tune entry action spacing",
                  message:
                    "Tune entry action spacing\n\nAlign the action row with the updated form density.",
                  author: "Steve Juma",
                  authoredAt: "2026-07-25T14:20:00Z",
                  source: "commit",
                  imageUrl: oldImage,
                },
              ],
          nextCursor: cursor ? null : "older",
        })}
        loadComponentDiff={async ({ beforeRevisionId, afterRevisionId }) => ({
          ok: true,
          beforeRevisionId,
          afterRevisionId,
          truncated: false,
          files: [
            {
              beforePath: "src/shared/forms/entry-actions/EntryActions.svelte",
              afterPath: "src/shared/forms/entry-actions/EntryActions.svelte",
              hunks: [
                {
                  header: "@@ -18,3 +18,3 @@",
                  lines: [
                    {
                      beforeNumber: 18,
                      afterNumber: 18,
                      before: '<div class="entry-actions compact">',
                      after: '<div class="entry-actions comfortable">',
                      kind: "changed",
                    },
                    {
                      beforeNumber: 19,
                      afterNumber: 19,
                      before: "  <button>Save</button>",
                      after: "  <button>Save</button>",
                      kind: "context",
                    },
                  ],
                },
              ],
            },
          ],
        })}
      />
    </div>
  );
}

/** Toolbar-ish strip matching the sticky header controls people see in the panel. */
export function PanelChromeFixture() {
  return (
    <div
      data-testid="panel-chrome-fixture"
      style={{ display: "grid", gap: 16 }}
    >
      <div style={rowStyle}>
        <VisualStatusBadge status="pass" />
        <ReviewStatusPad value="ready" onSelect={() => undefined} />
      </div>
      <div style={rowStyle}>
        <LiveVisibilityToggle liveVisible onToggle={() => undefined} />
        <PlacementPad value="right" active onToggle={() => undefined} />
      </div>
      <ImageGallery
        images={SAMPLE_IMAGES}
        selectedIndex={0}
        onSelect={() => undefined}
      />
      <BaselineAccordion
        sections={[
          {
            id: "default",
            label: "Default",
            hint: "End of play · primary baseline",
            thumbSrc: SAMPLE_IMAGES[0]?.src,
            status: "pass",
            stats: "0.0000%",
          },
          {
            id: "opens-chooser",
            label: "Opens chooser",
            hint: "No baseline yet",
            step: {
              callId: "call-1",
              label: "Opens chooser",
              stepId: "opens-chooser",
            },
          },
        ]}
        expandedId="default"
        busy={false}
        showDistribution={false}
        onExpand={() => undefined}
        onCreate={() => undefined}
        onUpdate={() => undefined}
        onUpdateDefault={() => undefined}
        onToggleDistribution={() => undefined}
        renderBody={(section) => (
          <FormPlaceholder>Body for {section.label}</FormPlaceholder>
        )}
      />
    </div>
  );
}
