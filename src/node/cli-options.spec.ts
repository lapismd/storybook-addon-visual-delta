import { expect, it } from "vitest";
import { configureCaptureCli } from "./cli-options.js";
it("propagates one-shot selection and local-config suppression to child commands", () => {
  const environment: NodeJS.ProcessEnv = {
    VISUAL_DELTA_CAPTURE_PROFILE: "docker",
  };
  const argv = [
    "test",
    "--all",
    "--capture-profile",
    "native",
    "--no-local-config",
  ];
  expect(configureCaptureCli(argv, environment)).toEqual(["test", "--all"]);
  expect(environment).toEqual({
    VISUAL_DELTA_CAPTURE_PROFILE: "native",
    VISUAL_DELTA_NO_LOCAL_CONFIG: "1",
  });
  expect(argv).toContain("--capture-profile");
});
it("rejects ambiguous selection before a child could choose another profile", () => {
  expect(() =>
    configureCaptureCli(
      [
        "test",
        "--all",
        "--capture-profile",
        "native",
        "--capture-profile",
        "docker",
      ],
      {},
    ),
  ).toThrow(/exactly one/);
  expect(() =>
    configureCaptureCli(["test", "--capture-profile", "--all"], {}),
  ).toThrow(/requires a profile/);
});
