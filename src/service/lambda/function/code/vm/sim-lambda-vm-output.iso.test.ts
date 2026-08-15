import {
  assertIdentical,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { simLambdaVmZipFunctionFactory } from "../sim-lambda-vm-zip-function.factory.js";

/**
 * A handler building its own console over the standard streams at module
 * scope, as AWS Lambda Powertools' logger does so that a warm container
 * reuses it and console patching cannot affect its output.
 */
const powertoolsStyleLoggerSource = `
  const { Console } = require("node:console");
  const logger = new Console({
    stdout: process.stdout,
    stderr: process.stderr,
  });

  exports.handler = async (event) => {
    logger.log("logged " + event.name);
    return { logged: event.name };
  };
`;

describe("sim Lambda vm code output streams", () => {
  it("runs a handler that builds its own console, as Powertools does", async () => {
    // Given a function whose module scope constructs a node:console Console
    // over process.stdout and process.stderr, like Powertools' logger.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: powertoolsStyleLoggerSource,
    });
    captureHostStdout();

    // When the function is invoked.
    const result = await simFunction.invoke({ name: "powertools" });

    // Then the module loaded and the handler ran, rather than the import
    // failing with ERR_CONSOLE_WRITABLE_STREAM. The result is cloned because
    // vm result objects belong to the vm realm.
    const returned = structuredClone(result) as Record<string, unknown>;
    assertIdentical(returned["logged"], "powertools");
  });

  it("sends what that console logs where console.log already goes", async () => {
    // Given a function logging through its own console and the global one.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: `
        const { Console } = require("node:console");
        const logger = new Console({
          stdout: process.stdout,
          stderr: process.stderr,
        });

        exports.handler = async () => {
          logger.log("logged by its own console");
          console.log("logged by the global console");
          return null;
        };
      `,
    });
    const written = captureHostStdout();

    // When the function is invoked.
    await simFunction.invoke({});

    // Then both went to the host's standard output, so neither is lost.
    assertStringIncludes(written.join(""), "logged by its own console");
    assertStringIncludes(written.join(""), "logged by the global console");
  });

  it("captures what function code writes to process.stdout", async () => {
    // Given a function writing to the standard output stream directly, as
    // Powertools' metrics does to emit EMF.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: String.raw`
        exports.handler = async (event) => {
          process.stdout.write(JSON.stringify(event) + "\n");
          return null;
        };
      `,
    });
    const written = captureHostStdout();

    // When the function is invoked.
    await simFunction.invoke({ metric: "orders", value: 3 });

    // Then the write reached the host's standard output, where a test can
    // read it.
    assertStringIncludes(written.join(""), '{"metric":"orders","value":3}');
  });

  it("captures what function code writes to process.stderr", async () => {
    // Given a function writing to the standard error stream, both directly
    // and through the console the sandbox provides.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: String.raw`
        exports.handler = async () => {
          process.stderr.write("written to the stream\n");
          console.error("logged through the console");
          return null;
        };
      `,
    });
    const written = captureHostStderr();

    // When the function is invoked.
    await simFunction.invoke({});

    // Then both reached the host's standard error, separately from its
    // standard output.
    assertStringIncludes(written.join(""), "written to the stream");
    assertStringIncludes(written.join(""), "logged through the console");
  });

  it("reports the write as accepted, so code awaiting a drain continues", async () => {
    // Given a function reading what the stream says about its write.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: String.raw`
        exports.handler = async () =>
          process.stdout.write("accepted\n");
      `,
    });
    captureHostStdout();

    // When the function is invoked.
    const accepted = await simFunction.invoke({});

    // Then the stream accepted it, as an unfilled buffer does.
    assertTrue(accepted);
  });
});

function captureHostStdout(): string[] {
  return captureHostStream(process.stdout);
}

function captureHostStderr(): string[] {
  return captureHostStream(process.stderr);
}

/**
 * Capture what reaches a host standard stream, which is where the simulator
 * sends a handler's output, keeping the test run's own output clean.
 */
function captureHostStream(stream: NodeJS.WriteStream): string[] {
  const written: string[] = [];

  vi.spyOn(stream, "write").mockImplementation((chunk): boolean => {
    written.push(String(chunk));
    return true;
  });

  return written;
}
