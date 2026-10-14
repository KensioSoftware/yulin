import { execFileSync } from "node:child_process";
import { isBuiltin } from "node:module";
import vm from "node:vm";
import { assertArrayEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simLambdaEnvironmentFactory } from "../../environment/sim-lambda-environment.factory.js";
import { makeSimLambdaVmContext } from "./sim-lambda-vm-context.js";

/**
 * Host globals the sandbox leaves out on purpose. There are none yet: a
 * global the sandbox replaces, such as `Date` or `fetch`, is still there.
 *
 * Node.js also puts each built-in module on the global object of code run
 * with `--eval`, as a shortcut for the REPL. Function code on the runtime
 * never sees those, so `isBuiltin` leaves them out rather than this list.
 */
const excludedHostGlobals = new Set<string>();

describe("sim Lambda vm sandbox globals", () => {
  it("provides every global the host Node.js provides", () => {
    // Given the globals a fresh Node.js process starts with, read from one
    // rather than from this test process, which the test runner adds to.
    const hostGlobals = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          "console.log(JSON.stringify(Object.getOwnPropertyNames(globalThis)))",
        ],
        { encoding: "utf8" },
      ),
    ) as string[];

    // When the globals of a sandbox are listed.
    const context = makeSimLambdaVmContext({
      environment: simLambdaEnvironmentFactory.make(),
    });
    const sandboxGlobals = new Set(
      vm.runInContext(
        "Object.getOwnPropertyNames(globalThis)",
        context,
      ) as string[],
    );

    // Then the sandbox has each one the runtime would give function code.
    const missing = hostGlobals.filter(
      (name) =>
        !sandboxGlobals.has(name) &&
        !isBuiltin(name) &&
        !excludedHostGlobals.has(name),
    );
    assertArrayEquals(missing, []);
  });
});
