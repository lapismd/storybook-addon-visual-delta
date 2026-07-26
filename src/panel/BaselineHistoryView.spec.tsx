import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../test/render.js";
import {
  BaselineHistoryView,
  type BaselineHistoryDiffLoader,
  type BaselineHistoryLoader,
} from "./BaselineHistoryView.js";
import type { BaselineHistoryEntry } from "../shared/baseline-history.js";
import type { DiffResultData } from "../types.js";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

const entries: BaselineHistoryEntry[] = [
  {
    revisionId: "working-copy",
    displayId: "Working copy",
    subject: "Uncommitted baseline",
    message: "Current workspace bytes.",
    author: "Local workspace",
    authoredAt: "2026-07-26T12:00:00Z",
    source: "working-copy",
    imageUrl: "data:image/png;base64,working",
  },
  {
    revisionId: "a".repeat(40),
    displayId: "change-a",
    secondaryId: "aaaaaaaaaaaa",
    subject: "Update baseline",
    message: "Update baseline\n\nMatch the new spacing.",
    author: "Ava Reviewer",
    authoredAt: "2026-07-25T12:00:00Z",
    source: "commit",
    imageUrl: "data:image/png;base64,a",
  },
  {
    revisionId: "b".repeat(40),
    displayId: "change-b",
    secondaryId: "bbbbbbbbbbbb",
    subject: "Add baseline",
    message: "Add baseline",
    author: "Ben Builder",
    authoredAt: "2026-07-24T12:00:00Z",
    source: "commit",
    imageUrl: "data:image/png;base64,b",
  },
];

const comparison: DiffResultData = {
  actualImage: "data:image/png;base64,actual",
  diffImage: "data:image/png;base64,diff",
  baselineImage: "data:image/png;base64,baseline",
  focusImage: "data:image/png;base64,focus",
  changeBounds: null,
  imageWidth: 300,
  imageHeight: 150,
  cssWidth: 100,
  cssHeight: 50,
  deviceScaleFactor: 3,
  diffPixels: 2,
  totalPixels: 45_000,
  diffPercent: 0.0044,
  passThresholdPercent: 1,
  passed: true,
  diffHistogram: new Array(32).fill(0),
};

const compareImages = vi.fn(async () => comparison);
const loadComponentDiff = vi.fn<BaselineHistoryDiffLoader>(async (args) => ({
  ok: true,
  beforeRevisionId: args.beforeRevisionId,
  afterRevisionId: args.afterRevisionId,
  truncated: false,
  files: [
    {
      beforePath: "src/forms/Example.svelte",
      afterPath: "src/forms/Example.svelte",
      hunks: [
        {
          header: "@@ -1 +1 @@",
          lines: [
            {
              beforeNumber: 1,
              afterNumber: 1,
              before: "<div>Before</div>",
              after: "<div>After</div>",
              kind: "changed",
            },
          ],
        },
      ],
    },
  ],
}));

describe("BaselineHistoryView", () => {
  it("defaults to the newest commit versus a changed working copy", async () => {
    const loader = vi.fn<BaselineHistoryLoader>(async () => ({
      ok: true,
      vcs: "jj",
      followsRenames: false,
      entries,
      nextCursor: null,
    }));
    renderWithTheme(
      <BaselineHistoryView
        target={{
          path: "forms/example.png",
          label: "Default",
          componentPath: "src/forms/Example.stories.svelte",
        }}
        onClose={vi.fn()}
        loadHistory={loader}
        loadComponentDiff={loadComponentDiff}
        compareImages={compareImages}
      />,
    );

    expect(await screen.findByText("Default history")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "Use Update baseline as Before",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", {
        name: "Use Uncommitted baseline as After",
      }),
    ).toBeChecked();
    expect(screen.getByTitle("History provided by jj")).toBeInTheDocument();
    expect(
      await screen.findByText("Component diff", { selector: "h3" }),
    ).toBeInTheDocument();
    expect(screen.getByText("− <div>Before</div>")).toBeInTheDocument();
    expect(screen.getByText("+ <div>After</div>")).toBeInTheDocument();
    expect(loadComponentDiff).toHaveBeenCalledWith(
      expect.objectContaining({
        componentPath: "src/forms/Example.stories.svelte",
      }),
    );
  });

  it("changes revision selections, loads another page, and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const loader = vi.fn<BaselineHistoryLoader>(async ({ cursor }) =>
      cursor
        ? {
            ok: true,
            vcs: "git",
            followsRenames: true,
            entries: [entries[2]!],
            nextCursor: null,
          }
        : {
            ok: true,
            vcs: "git",
            followsRenames: true,
            entries: entries.slice(0, 2),
            nextCursor: "page-2",
          },
    );
    renderWithTheme(
      <BaselineHistoryView
        target={{ path: "forms/example.png", label: "Default" }}
        onClose={onClose}
        loadHistory={loader}
        loadComponentDiff={loadComponentDiff}
        compareImages={compareImages}
      />,
    );

    await user.click(
      await screen.findByRole("radio", {
        name: "Use Update baseline as After",
      }),
    );
    expect(
      screen.getByRole("radio", {
        name: "Use Update baseline as After",
      }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Load more baseline history" }),
    );
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Add baseline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to baseline" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
