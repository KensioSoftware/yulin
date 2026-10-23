import {
  assertArrayEmpty,
  assertArrayLength,
  assertStringIncludes,
} from "@kensio/smartass";
import { randomUUID } from "node:crypto";
import { describe, it, vi } from "vitest";
import { SimLambdaEnvironmentConflicts } from "./sim-lambda-environment-conflicts.js";
import { simLambdaEnvironmentFactory } from "./sim-lambda-environment.factory.js";

/**
 * Collect the warnings a check emits, keeping them out of the test output.
 */
function warningsFrom(check: () => void): string[] {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {
    /* captured, not printed */
  });

  try {
    check();
    return warn.mock.calls.map((call) => String(call[0]));
  } finally {
    warn.mockRestore();
  }
}

/**
 * A variable name no other test reads, since a read outside an invocation
 * stays on record for the rest of the test run.
 */
function uniqueName(): string {
  return `YULIN_${randomUUID().replaceAll("-", "_").toUpperCase()}`;
}

/**
 * Read a variable outside any invocation, as a module-scope read does.
 */
function readEarly(name: string): void {
  // oxlint-disable-next-line security/detect-object-injection
  void process.env[name];
}

describe("sim Lambda environment conflicts", () => {
  it("warns when the host process sets the name differently", () => {
    // Given a host variable whose value differs from the declared one, read
    // before the function exists.
    const name = uniqueName();
    // oxlint-disable-next-line security/detect-object-injection
    process.env[name] = "host value";
    readEarly(name);

    try {
      const environment = simLambdaEnvironmentFactory.make({
        functionName: "greeter",
        declaredVariables: { [name]: "declared value" },
      });

      // When the new function's environment is checked.
      const warnings = warningsFrom(() => {
        new SimLambdaEnvironmentConflicts().check(environment, []);
      });

      // Then the mismatch is reported with the advice that resolves it.
      assertArrayLength(warnings, 1);
      assertStringIncludes(warnings[0], "greeter");
      assertStringIncludes(warnings[0], name);
      assertStringIncludes(warnings[0], "inside the handler function");
    } finally {
      Reflect.deleteProperty(process.env, name);
    }
  });

  it("stays quiet about a host value nothing read early", () => {
    // Given a host variable whose value differs from the declared one, which
    // no code has read.
    const name = uniqueName();
    // oxlint-disable-next-line security/detect-object-injection
    process.env[name] = "host value";

    try {
      const environment = simLambdaEnvironmentFactory.make({
        functionName: "greeter",
        declaredVariables: { [name]: "declared value" },
      });

      // When the new function's environment is checked.
      const warnings = warningsFrom(() => {
        new SimLambdaEnvironmentConflicts().check(environment, []);
      });

      // Then nothing is reported, since no code saw the host value.
      assertArrayEmpty(warnings);
    } finally {
      Reflect.deleteProperty(process.env, name);
    }
  });

  it("stays quiet when the host process sets the same value", () => {
    // Given a host variable that agrees with the declared one.
    process.env["YULIN_AGREES"] = "same value";

    try {
      const environment = simLambdaEnvironmentFactory.make({
        functionName: "greeter",
        declaredVariables: {
          YULIN_AGREES: "same value",
        },
      });

      // When the new function's environment is checked.
      const warnings = warningsFrom(() => {
        new SimLambdaEnvironmentConflicts().check(environment, []);
      });

      // Then nothing is reported: a module-scope read gets the right value
      // anyway, so there is no mismatch to explain.
      assertArrayEmpty(warnings);
    } finally {
      delete process.env["YULIN_AGREES"];
    }
  });

  it("stays quiet when the host process does not set the name", () => {
    // Given a declared variable the host process knows nothing about.
    const environment = simLambdaEnvironmentFactory.make({
      functionName: "greeter",
      declaredVariables: {
        YULIN_UNSET_ON_HOST: "declared value",
      },
    });

    // When the new function's environment is checked.
    const warnings = warningsFrom(() => {
      new SimLambdaEnvironmentConflicts().check(environment, []);
    });

    // Then there is nothing to report.
    assertArrayEmpty(warnings);
  });

  it("warns when another function declares the name differently", () => {
    // Given an existing function declaring a different value for a name that
    // code read outside an invocation.
    const name = uniqueName();
    readEarly(name);
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { [name]: "widgets" },
    });
    const environment = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { [name]: "gadgets" },
    });

    // When the new function's environment is checked against it.
    const warnings = warningsFrom(() => {
      new SimLambdaEnvironmentConflicts().check(environment, [existing]);
    });

    // Then both function names are reported with the variable name.
    assertArrayLength(warnings, 1);
    assertStringIncludes(warnings[0], "reader");
    assertStringIncludes(warnings[0], "writer");
    assertStringIncludes(warnings[0], name);
  });

  it("stays quiet about functions differing on a name nothing read early", () => {
    // Given two functions declaring different values for a name that code
    // reads only inside an invocation.
    const name = uniqueName();
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { [name]: "widgets" },
    });
    const environment = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { [name]: "gadgets" },
    });

    // When the new function's environment is checked against it.
    const warnings = warningsFrom(() => {
      new SimLambdaEnvironmentConflicts().check(environment, [existing]);
    });

    // Then nothing is reported, since each function sees its own value.
    assertArrayEmpty(warnings);
  });

  it("warns at invocation about an early read made after the check", () => {
    // Given two functions differing on a name, checked before any code read
    // it.
    const name = uniqueName();
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { [name]: "widgets" },
    });
    const created = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { [name]: "gadgets" },
    });
    const conflicts = new SimLambdaEnvironmentConflicts({
      currentEnvironments: () => [existing, created],
    });
    const checked = warningsFrom(() => {
      conflicts.check(created, [existing]);
    });

    // When code reads it outside an invocation, as a handler module imported
    // late does, and the functions are invoked twice.
    readEarly(name);
    const invoked = warningsFrom(() => {
      conflicts.reportReads();
      conflicts.reportReads();
    });

    // Then the check said nothing, and the first invocation reported it once.
    assertArrayEmpty(checked);
    assertArrayLength(invoked, 1);
    assertStringIncludes(invoked[0], "reader");
    assertStringIncludes(invoked[0], "writer");
    assertStringIncludes(invoked[0], name);
  });

  it("stays quiet at invocation about a function deleted since the check", () => {
    // Given two functions differing on a name nothing had read, one of which
    // has since been deleted.
    const name = uniqueName();
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { [name]: "widgets" },
    });
    const deleted = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { [name]: "gadgets" },
    });
    const conflicts = new SimLambdaEnvironmentConflicts({
      currentEnvironments: () => [existing],
    });
    conflicts.check(deleted, [existing]);

    // When code reads the name outside an invocation and the remaining
    // function is invoked.
    readEarly(name);
    const invoked = warningsFrom(() => {
      conflicts.reportReads();
    });

    // Then nothing is reported, since one value for the name is left.
    assertArrayEmpty(invoked);
  });

  it("stays quiet when functions agree on the value", () => {
    // Given two functions declaring the same value for the same name.
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { TABLE_NAME: "widgets" },
    });
    const environment = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { TABLE_NAME: "widgets" },
    });

    // When the new function's environment is checked against it.
    const warnings = warningsFrom(() => {
      new SimLambdaEnvironmentConflicts().check(environment, [existing]);
    });

    // Then there is nothing to report.
    assertArrayEmpty(warnings);
  });

  it("stays quiet when another function declares nothing in common", () => {
    // Given an existing function declaring an unrelated variable.
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { QUEUE_URL: "widgets" },
    });
    const environment = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { TABLE_NAME: "gadgets" },
    });

    // When the new function's environment is checked against it.
    const warnings = warningsFrom(() => {
      new SimLambdaEnvironmentConflicts().check(environment, [existing]);
    });

    // Then there is nothing to report.
    assertArrayEmpty(warnings);
  });

  it("reports each variable name only once", () => {
    // Given a conflict on a name read early that would be found again by a
    // later function.
    const name = uniqueName();
    readEarly(name);
    const conflicts = new SimLambdaEnvironmentConflicts();
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { [name]: "widgets" },
    });

    // When two more functions are checked against it.
    const warnings = warningsFrom(() => {
      conflicts.check(
        simLambdaEnvironmentFactory.make({
          functionName: "writer",
          declaredVariables: { [name]: "gadgets" },
        }),
        [existing],
      );
      conflicts.check(
        simLambdaEnvironmentFactory.make({
          functionName: "deleter",
          declaredVariables: { [name]: "sprockets" },
        }),
        [existing],
      );
    });

    // Then the same variable name is only reported the first time.
    assertArrayLength(warnings, 1);
  });
});
