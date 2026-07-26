import React from "react";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { HashEntry } from "storybook/manager-api";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderVisualStatusSidebarLabel,
  VisualStatusToolbarLabel,
  visualSidebarBadgeFromTags,
} from "./VisualStatusLabel.js";

afterEach(cleanup);

function entry(tags: string[]): HashEntry {
  return {
    id: "visual-delta--fixture",
    name: "Fixture story",
    type: "story",
    tags,
  } as HashEntry;
}

describe("visualSidebarBadgeFromTags", () => {
  it("uses skip, failed, ready, pending, approved precedence", () => {
    expect(
      visualSidebarBadgeFromTags([
        "visual-approved",
        "visual-pending",
        "visual-ready",
        "visual-failed",
        "skip-visual",
      ])?.status,
    ).toBe("skip");
    expect(
      visualSidebarBadgeFromTags([
        "visual-approved",
        "visual-pending",
        "visual-ready",
        "visual-failed",
      ])?.status,
    ).toBe("failed");
    expect(
      visualSidebarBadgeFromTags([
        "visual-approved",
        "visual-pending",
        "visual-ready",
      ])?.status,
    ).toBe("ready");
    expect(
      visualSidebarBadgeFromTags(["visual-approved", "visual-pending"])?.status,
    ).toBe("pending");
    expect(visualSidebarBadgeFromTags(["visual-approved"])?.status).toBe(
      "approved",
    );
  });

  it("ignores non-visual labels", () => {
    expect(
      visualSidebarBadgeFromTags([
        "skip-test",
        "upstream-example",
        "experimental",
      ]),
    ).toBeNull();
  });
});

describe("renderVisualStatusSidebarLabel", () => {
  it("renders an accessible committed status without replacing the name", () => {
    render(renderVisualStatusSidebarLabel(entry(["visual-ready"])));

    expect(screen.getByText("Fixture story")).toBeVisible();
    expect(
      screen.getByLabelText("Ready: Visual baseline is ready for review"),
    ).toHaveAttribute("data-tag", "visual-ready");
  });

  it("renders inherited component tags through the same label", () => {
    const component = {
      ...entry(["visual-approved"]),
      type: "component",
      name: "Fixture component",
    } as HashEntry;
    render(renderVisualStatusSidebarLabel(component));

    expect(screen.getByText("Fixture component")).toBeVisible();
    expect(
      screen.getByLabelText(
        "Approved: Visual baseline has been reviewed and accepted",
      ),
    ).toBeVisible();
  });
});

describe("VisualStatusToolbarLabel", () => {
  it("renders the named status with the shared glyph and description", () => {
    render(<VisualStatusToolbarLabel tags={["visual-pending"]} />);

    expect(screen.getByText("Pending review")).toBeVisible();
    expect(screen.getByText("⏱")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByLabelText(
        "Pending review: Visual baseline is awaiting review",
      ),
    ).toHaveAttribute("data-tag", "visual-pending");
  });

  it("renders nothing without a visual status", () => {
    const { container } = render(
      <VisualStatusToolbarLabel tags={["autodocs"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
