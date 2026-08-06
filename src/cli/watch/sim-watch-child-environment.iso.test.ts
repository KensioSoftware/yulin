import path from "node:path";
import {
  assertIdentical,
  assertStringIncludes,
  assertStringStartsWith,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchChildEnvironment } from "./sim-watch-child-environment.js";
import { simWatchConfig } from "../../watch/sim-watch.config.js";

const cwd = path.resolve("/projects/media");

describe("SimWatchChildEnvironment", () => {
  it("puts the project's own binaries on the path", () => {
    // Given a supervisor started from a shell, with no project bin on PATH
    const environment = new SimWatchChildEnvironment({
      cwd,
      environment: { PATH: "/usr/bin" },
    });

    // When the environment for a run is built
    const built = environment.build();

    // Then a command such as tsx resolves from the project it is running in
    assertStringStartsWith(
      built["PATH"] ?? "",
      path.join(cwd, "node_modules", ".bin"),
    );
    assertStringIncludes(built["PATH"] ?? "", "/usr/bin");
  });

  it("leaves a path that already has the project's binaries alone", () => {
    // Given a run through a package script, which has already done this
    const localBin = path.join(cwd, "node_modules", ".bin");
    const environment = new SimWatchChildEnvironment({
      cwd,
      environment: { PATH: `${localBin}${path.delimiter}/usr/bin` },
    });

    // When the environment for a run is built
    const built = environment.build();

    // Then the same directory is not added twice
    assertIdentical(built["PATH"], `${localBin}${path.delimiter}/usr/bin`);
  });

  it("marks the process as supervised", () => {
    // Given any run
    const environment = new SimWatchChildEnvironment({ cwd, environment: {} });

    // When the environment for it is built
    const built = environment.build();

    // Then the runtime in the process knows there is a supervisor to talk to
    assertIdentical(
      built[simWatchConfig.environmentVariableName],
      simWatchConfig.environmentVariableValue,
    );
  });

  it("passes an inspector flag through the node options", () => {
    // Given a run that wants a debugger, of a command that is not node
    const environment = new SimWatchChildEnvironment({
      cwd,
      inspect: "--inspect=9230",
      environment: { ["NODE_OPTIONS"]: "--enable-source-maps" },
    });

    // When the environment for it is built
    const built = environment.build();

    // Then the flag reaches node whatever the command turns out to be
    assertIdentical(
      built["NODE_OPTIONS"],
      "--enable-source-maps --inspect=9230",
    );
  });

  it("leaves node options alone when no debugger was asked for", () => {
    // Given an ordinary run
    const environment = new SimWatchChildEnvironment({ cwd, environment: {} });

    // When the environment for it is built
    const built = environment.build();

    // Then nothing is added for a debugger nobody wanted
    assertUndefined(built["NODE_OPTIONS"]);
  });
});
