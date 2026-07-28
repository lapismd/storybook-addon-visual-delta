import type { Call } from "storybook/internal/instrumenter";
import { describe, expect, it } from "vitest";
import {
  instrumenterCallLabel,
  instrumenterCallSyntax,
  instrumenterStepsFromCalls,
  mergeInteractionRows,
} from "./usePlaySteps.js";

describe("Visual Delta interaction rows", () => {
  it("labels ordinary Storybook calls from their instrumenter path", () => {
    expect(
      instrumenterCallLabel({
        args: [],
        method: "click",
        path: ["userEvent"],
      }),
    ).toBe("userEvent.click");
    expect(
      instrumenterCallLabel({
        args: ["open"],
        method: "toHaveTextContent",
        path: ["expect", { __callId__: "query" }],
      }),
    ).toBe('expect.toHaveTextContent("open")');
  });

  it("keeps the exact replay call when a CSF interaction is merged", () => {
    expect(
      mergeInteractionRows(
        [
          {
            callId: "story [0] click",
            captureCallId: "story [0] click",
            label: "userEvent.click",
            stepId: "interaction-0-click",
          },
        ],
        [
          {
            id: "interaction-0-click",
            label: "Click filters",
            src: "/visual-baselines/click.png",
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        stepId: "interaction-0-click",
        captureCallId: "story [0] click",
      }),
    ]);
  });

  it("recovers completed calls retained by Storybook before the panel mounts", () => {
    const click = {
      id: "filter-story [1] click",
      cursor: 1,
      storyId: "filter-story",
      ancestors: [],
      args: [],
      method: "click",
      path: ["userEvent"],
      interceptable: true,
      retain: false,
      status: "done",
    } as Call;

    expect(instrumenterStepsFromCalls([click], "filter-story")).toEqual([
      expect.objectContaining({
        callId: click.id,
        captureCallId: click.id,
        label: "userEvent.click",
        stepId: "interaction-1-click",
      }),
    ]);
  });

  it("resolves nested call references into Storybook-style expectation syntax", () => {
    const element = {
      __element__: {
        localName: "div",
        classNames: ["panel-shell"],
      },
    };
    const expectCall = {
      id: "story [1] expect",
      cursor: 1,
      storyId: "story",
      ancestors: [],
      args: [element],
      method: "expect",
      path: [],
      interceptable: true,
      retain: false,
    } as Call;
    const assertionCall = {
      id: "story [2] toBeInTheDocument",
      cursor: 2,
      storyId: "story",
      ancestors: [],
      args: [],
      method: "toBeInTheDocument",
      path: [{ __callId__: expectCall.id }],
      interceptable: true,
      retain: false,
    } as Call;

    const syntax = instrumenterCallSyntax(
      assertionCall,
      new Map([[expectCall.id, expectCall]]),
    );

    expect(syntax.text).toBe("expect(<div.panel-shell>).toBeInTheDocument()");
    expect(syntax.tokens).toEqual(
      expect.arrayContaining([
        { kind: "method", text: "expect" },
        { kind: "tag", text: "div" },
        { kind: "tag-suffix", text: ".panel-shell" },
        { kind: "method", text: "toBeInTheDocument" },
      ]),
    );
  });
});
