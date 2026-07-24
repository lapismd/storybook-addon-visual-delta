import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STORYBOOK_PORT,
  DEFAULT_VISUAL_SERVER_PORT,
  resolveStorybookPort,
  resolveVisualServerPort,
} from "./options.js";

describe("resolveVisualServerPort", () => {
  const prevStorybook = process.env.STORYBOOK_PORT;
  const prevVisual = process.env.VISUAL_SERVER_PORT;
  const prevDelta = process.env.VISUAL_DELTA_SERVER_PORT;

  afterEach(() => {
    if (prevStorybook === undefined) delete process.env.STORYBOOK_PORT;
    else process.env.STORYBOOK_PORT = prevStorybook;
    if (prevVisual === undefined) delete process.env.VISUAL_SERVER_PORT;
    else process.env.VISUAL_SERVER_PORT = prevVisual;
    if (prevDelta === undefined) delete process.env.VISUAL_DELTA_SERVER_PORT;
    else process.env.VISUAL_DELTA_SERVER_PORT = prevDelta;
  });

  it("defaults to upstream Storybook port + 1", () => {
    delete process.env.STORYBOOK_PORT;
    delete process.env.VISUAL_SERVER_PORT;
    delete process.env.VISUAL_DELTA_SERVER_PORT;
    expect(DEFAULT_STORYBOOK_PORT).toBe(6006);
    expect(DEFAULT_VISUAL_SERVER_PORT).toBe(6007);
    expect(resolveVisualServerPort()).toBe(6007);
  });

  it("uses STORYBOOK_PORT + 1 when unset otherwise", () => {
    process.env.STORYBOOK_PORT = "9009";
    delete process.env.VISUAL_SERVER_PORT;
    delete process.env.VISUAL_DELTA_SERVER_PORT;
    expect(resolveStorybookPort()).toBe(9009);
    expect(resolveVisualServerPort()).toBe(9010);
  });

  it("prefers an explicit live Storybook listen port", () => {
    process.env.STORYBOOK_PORT = "9009";
    expect(resolveVisualServerPort(undefined, 9109)).toBe(9110);
  });

  it("prefers VISUAL_SERVER_PORT over Storybook + 1", () => {
    process.env.STORYBOOK_PORT = "9009";
    process.env.VISUAL_SERVER_PORT = "6200";
    expect(resolveVisualServerPort()).toBe(6200);
  });

  it("prefers options.visualServerPort over env", () => {
    process.env.STORYBOOK_PORT = "9009";
    process.env.VISUAL_SERVER_PORT = "6200";
    expect(resolveVisualServerPort({ visualServerPort: 6300 })).toBe(6300);
  });
});
