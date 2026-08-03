import React from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render.js";
import { ModeSelector } from "./ModeSelector.js";

describe("ModeSelector", () => {
  afterEach(() => cleanup());

  it("joins the active lightbox preview to the sole mode selector", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPreviewOpen = vi.fn();
    renderWithTheme(
      <ModeSelector
        modeNames={["Compact"]}
        value={null}
        onChange={onChange}
        previewSources={{
          Default: "/default.png",
          Compact: "/compact.png",
        }}
        onPreviewOpen={onPreviewOpen}
      />,
    );

    expect(screen.queryByText("Mode", { exact: true })).not.toBeInTheDocument();
    const split = screen.getByRole("group", {
      name: "Visual mode and baseline preview",
    });
    expect(split).toHaveStyle({ width: "78px", height: "78px" });
    const preview = screen.getByRole("button", {
      name: "Open Default baseline full image",
    });
    expect(split).toContainElement(preview);
    expect(preview.querySelector("img")).toHaveAttribute(
      "src",
      "/default.png",
    );
    expect(preview.querySelector("img")).toHaveStyle({
      objectFit: "contain",
      objectPosition: "center",
    });
    expect(preview).toHaveStyle({ width: "100%", height: "52px" });

    const trigger = screen.getByRole("button", {
      name: "Visual mode: Default, not run",
    });
    expect(split).toContainElement(trigger);
    expect(trigger).toHaveStyle({ width: "100%", height: "24px" });
    expect(trigger.querySelector("img")).not.toBeInTheDocument();

    await user.click(preview);
    expect(onPreviewOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Default",
        src: "/default.png",
        image: preview.querySelector("img"),
      }),
    );

    await user.click(trigger);
    const compact = await screen.findByRole("button", {
      name: "Compact mode, not run",
    });
    expect(compact.querySelector("img")).toHaveAttribute(
      "src",
      "/compact.png",
    );
    expect(compact.querySelector("img")).toHaveStyle({
      objectFit: "contain",
      objectPosition: "center",
    });
    await user.click(compact);

    expect(onChange).toHaveBeenCalledWith("Compact");
  });

  it("renders one uninterrupted lightbox button for one choice", async () => {
    const user = userEvent.setup();
    const onPreviewOpen = vi.fn();
    renderWithTheme(
      <ModeSelector
        modeNames={[]}
        value={null}
        onChange={vi.fn()}
        previewSources={{ Default: "/default.png" }}
        onPreviewOpen={onPreviewOpen}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "Visual mode: Default, not run",
      }),
    ).not.toBeInTheDocument();
    const preview = screen.getByRole("button", {
      name: "Open Default baseline full image",
    });
    expect(preview).toHaveStyle({ width: "100%", height: "76px" });

    await user.click(preview);
    expect(onPreviewOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps missing mode coverage aligned in the image menu", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <ModeSelector
        modeNames={["Compact"]}
        value={null}
        onChange={vi.fn()}
        previewSources={{ Default: "/default.png" }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Visual mode: Default, not run",
      }),
    );
    const compact = await screen.findByRole("button", {
      name: "Compact mode, not run",
    });
    expect(compact).toHaveTextContent("No image");
    expect(compact.querySelector("img")).not.toBeInTheDocument();
  });
});
