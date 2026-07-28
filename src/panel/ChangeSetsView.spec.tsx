import React from "react";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  VisualDeltaChangeSet,
  VisualDeltaChangeSetsResponse,
} from "../shared/change-sets.js";
import { renderWithTheme } from "../test/render.js";
import { ChangeSetOutcomeNotice, ChangeSetsView } from "./ChangeSetsView.js";

afterEach(cleanup);

const pending: VisualDeltaChangeSet = {
  id: "change-1",
  state: "pending",
  createdAt: "2026-07-28T10:00:00.000Z",
  updatedAt: "2026-07-28T10:00:00.000Z",
  baseRevision: "a".repeat(40),
  vcs: "jj",
  mode: "review",
  message: "Visual Delta: review status Dialog",
  operations: [
    {
      id: "operation-1",
      action: "review-status",
      scope: "Dialog",
      storyIds: ["dialog--opens"],
      createdAt: "2026-07-28T10:00:00.000Z",
      success: true,
    },
  ],
  files: [
    {
      path: "src/Dialog.stories.svelte",
      change: "modified",
      binary: true,
      image: false,
      beforeHash: "before",
      afterHash: "after",
    },
  ],
  blockReasons: [],
  commitAllowed: true,
};

describe("ChangeSetsView", () => {
  it("links auto-commit feedback back to the Changes screen", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithTheme(
      <ChangeSetOutcomeNotice
        message="Committed as change123456."
        onOpen={onOpen}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Open Visual Delta changes" }),
    );
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("reviews a complete change set and commits it with an editable message", async () => {
    const user = userEvent.setup();
    const response: VisualDeltaChangeSetsResponse = {
      ok: true,
      pendingCount: 1,
      changeSets: [pending],
    };
    const committed: VisualDeltaChangeSet = {
      ...pending,
      state: "committed",
      commitAllowed: false,
      commit: {
        vcs: "jj",
        revisionId: "b".repeat(40),
        displayId: "change123456",
        message: "Approve Dialog visual",
        committedAt: "2026-07-28T10:01:00.000Z",
      },
    };
    const load = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({
        ok: true,
        pendingCount: 0,
        changeSets: [committed],
      });
    const commit = vi.fn(async () => committed);
    renderWithTheme(
      <ChangeSetsView
        onClose={() => {}}
        loadChangeSets={load}
        commitChangeSet={commit}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Changes" }),
    ).toBeVisible();
    expect(
      await screen.findByRole("list", { name: "Visual Delta operations" }),
    ).toHaveTextContent("dialog--opens");
    const message = await screen.findByLabelText("Visual Delta commit message");
    await waitFor(() =>
      expect(message).toHaveValue("Visual Delta: review status Dialog"),
    );
    await user.clear(message);
    await user.type(message, "Approve Dialog visual");
    await user.click(
      screen.getByRole("button", { name: "Commit Visual Delta change set" }),
    );

    expect(commit).toHaveBeenCalledWith({
      changeSetId: "change-1",
      message: "Approve Dialog visual",
    });
    expect(
      await screen.findByText(/Committed as JJ change123456/),
    ).toBeVisible();
  });
});
