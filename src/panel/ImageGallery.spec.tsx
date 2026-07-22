import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageGallery } from "./ImageGallery.js";
import { renderWithTheme } from "../test/render.js";
import type { VisualDeltaImage } from "../constants.js";

const images: VisualDeltaImage[] = [
  {
    src: "/a.png",
    offsetX: 0,
    offsetY: 0,
    align: "canvas",
    placement: "center",
  },
  {
    src: "/b.png",
    offsetX: 0,
    offsetY: 0,
    align: "canvas",
    placement: "center",
  },
];

describe("ImageGallery", () => {
  it("selects a thumb and deselects when clicked again", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithTheme(
      <ImageGallery images={images} selectedIndex={0} onSelect={onSelect} />,
    );

    expect(screen.getByAltText("Baseline 1")).toBeInTheDocument();
    expect(screen.getByAltText("Baseline 2")).toBeInTheDocument();

    await user.click(screen.getByTitle("Select image 2"));
    expect(onSelect).toHaveBeenCalledWith(1);

    await user.click(screen.getByTitle("Select image 1"));
    expect(onSelect).toHaveBeenCalledWith(-1);
  });
});
