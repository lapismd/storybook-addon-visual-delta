import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  BaselineAccordionFixture,
  BaselineHistoryViewFixture,
  ImageGalleryFixture,
  LiveVisibilityFixture,
  PanelChromeFixture,
  PlacementPadFixture,
  ReviewStatusFixture,
  StatusBadgeFixture,
} from "./panel-fixtures.js";
import { ThemeHost } from "./ThemeHost.js";

const meta = {
  title: "Visual Delta/Panel Chrome",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component: [
          "Browseable mounts of the real Visual Delta manager/panel React controls (Storybook light theme).",
          "Tagged skip-visual — tooling chrome, not product UI.",
          "See **Panel Chrome/Guidance** for the story map and Spec links (`VD-UI-*`, `VD-VCS-001`).",
        ].join(" "),
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  name: "Overview",
  render: () => (
    <ThemeHost>
      <PanelChromeFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByTestId("panel-chrome-fixture"));
    await expect(
      canvas.getByTestId("panel-chrome-fixture"),
    ).toBeInTheDocument();
  },
};

export const BaselineHistory: Story = {
  name: "Baseline history",
  render: () => (
    <ThemeHost>
      <BaselineHistoryViewFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", { name: "Default history" }),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole("radio", {
        name: "Use Tune entry action spacing as Before",
      }),
    ).toBeChecked();
    await expect(
      await canvas.findByRole("radio", {
        name: "Use Uncommitted baseline as After",
      }),
    ).toBeChecked();
    await expect(
      await canvas.findByRole("tab", { name: "2-up" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByLabelText(/Visual compare/)).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Diff" }));
    await expect(canvas.getByRole("tab", { name: "Diff" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      await canvas.findByText("Component diff", { selector: "h3" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('− <div class="entry-actions compact">'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('+ <div class="entry-actions comfortable">'),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Load more baseline history" }),
    );
    await expect(
      await canvas.findByText("Create entry actions baseline"),
    ).toBeInTheDocument();
  },
};

export const PlacementPadSoftHide: Story = {
  name: "Placement pad soft-hide",
  render: () => (
    <ThemeHost>
      <PlacementPadFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = await waitFor(() =>
      canvas.getByTestId("placement-pad-fixture"),
    );
    const scope = within(fixture);

    await expect(scope.getByTestId("fixture-overlay-on")).toHaveTextContent(
      "true",
    );
    await expect(scope.getByTestId("fixture-placement")).toHaveTextContent(
      "right",
    );

    await userEvent.click(
      scope.getByRole("switch", {
        name: "Hide overlay (Baseline right of live)",
      }),
    );
    await expect(scope.getByTestId("fixture-overlay-on")).toHaveTextContent(
      "false",
    );
    await expect(scope.getByTestId("fixture-index")).toHaveTextContent("0");

    await userEvent.click(
      scope.getByRole("switch", { name: "Baseline left of live" }),
    );
    await expect(scope.getByTestId("fixture-overlay-on")).toHaveTextContent(
      "true",
    );
    await expect(scope.getByTestId("fixture-placement")).toHaveTextContent(
      "left",
    );
  },
};

export const ImageOnlyToggle: Story = {
  name: "Image only toggle",
  render: () => (
    <ThemeHost>
      <LiveVisibilityFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = await waitFor(() =>
      canvas.getByTestId("live-visibility-fixture"),
    );
    const scope = within(fixture);

    await expect(scope.getByTestId("fixture-live-visible")).toHaveTextContent(
      "true",
    );
    await userEvent.click(
      scope.getByRole("switch", { name: "Image only (hide live story)" }),
    );
    await expect(scope.getByTestId("fixture-live-visible")).toHaveTextContent(
      "false",
    );
    await expect(scope.queryByText("Image only")).not.toBeInTheDocument();
  },
};

export const ReviewStatusPad: Story = {
  name: "Review status pad",
  render: () => (
    <ThemeHost>
      <ReviewStatusFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = await waitFor(() =>
      canvas.getByTestId("review-status-fixture"),
    );
    const scope = within(fixture);

    await expect(scope.getByTestId("fixture-review-status")).toHaveTextContent(
      "none",
    );
    await userEvent.click(
      scope.getByRole("switch", {
        name: "Mark visual baseline ready for review",
      }),
    );
    await expect(scope.getByTestId("fixture-review-status")).toHaveTextContent(
      "ready",
    );
  },
};

export const StatusBadges: Story = {
  name: "Status badges",
  render: () => (
    <ThemeHost>
      <StatusBadgeFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByTestId("status-badge-fixture"));
    await expect(
      canvas.getByLabelText(/^Visual status: Pass\./),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText(/^Visual status: Fail\./),
    ).toBeInTheDocument();
  },
};

export const ImageGallery: Story = {
  name: "Image gallery",
  render: () => (
    <ThemeHost>
      <ImageGalleryFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = await waitFor(() =>
      canvas.getByTestId("image-gallery-fixture"),
    );
    const scope = within(fixture);

    await expect(scope.getByTestId("fixture-gallery-index")).toHaveTextContent(
      "0",
    );
    await userEvent.click(scope.getByTitle("Select image 2"));
    await expect(scope.getByTestId("fixture-gallery-index")).toHaveTextContent(
      "1",
    );
    await userEvent.click(scope.getByTitle("Select image 2"));
    await expect(scope.getByTestId("fixture-gallery-index")).toHaveTextContent(
      "-1",
    );
  },
};

export const BaselineAccordion: Story = {
  name: "Baseline accordion",
  render: () => (
    <ThemeHost>
      <BaselineAccordionFixture />
    </ThemeHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = await waitFor(() =>
      canvas.getByTestId("baseline-accordion-fixture"),
    );
    const scope = within(fixture);

    await expect(scope.getByTestId("fixture-expanded-id")).toHaveTextContent(
      "default",
    );
    await expect(
      scope.getByTestId("fixture-section-body-default"),
    ).toHaveTextContent("Body for Default");

    await userEvent.click(
      scope.getByRole("button", { name: "More Default baseline actions" }),
    );
    await userEvent.click(
      await waitFor(() =>
        within(document.body).getByRole("button", {
          name: "Open Default baseline history",
        }),
      ),
    );
    await expect(scope.getByTestId("fixture-history-opened")).toHaveTextContent(
      "Default",
    );

    await userEvent.click(
      scope.getByRole("button", { name: /^Opens chooser(?:\s|$)/i }),
    );
    await expect(scope.getByTestId("fixture-expanded-id")).toHaveTextContent(
      "opens-chooser",
    );
    await expect(
      scope.getByTestId("fixture-section-body-opens-chooser"),
    ).toHaveTextContent("Body for Opens chooser");
  },
};
