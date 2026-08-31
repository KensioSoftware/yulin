import {
  assertArrayEmpty,
  assertArrayLength,
  assertStringIncludes,
} from "@kensio/smartass";
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

describe("sim Lambda environment conflicts", () => {
  it("warns when the host process sets the name differently", () => {
    // Given a host variable whose value differs from the declared one.
    process.env["YULIN_CONFLICT"] = "host value";

    try {
      const environment = simLambdaEnvironmentFactory.make({
        functionName: "greeter",
        declaredVariables: {
          YULIN_CONFLICT: "declared value",
        },
      });

      // When the new function's environment is checked.
      const warnings = warningsFrom(() => {
        new SimLambdaEnvironmentConflicts().check(environment, []);
      });

      // Then the mismatch is reported with the advice that resolves it.
      assertArrayLength(warnings, 1);
      assertStringIncludes(warnings[0], "greeter");
      assertStringIncludes(warnings[0], "YULIN_CONFLICT");
      assertStringIncludes(warnings[0], "inside the handler function");
    } finally {
      delete process.env["YULIN_CONFLICT"];
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
    // Given an existing function declaring a different value for the name.
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { TABLE_NAME: "widgets" },
    });
    const environment = simLambdaEnvironmentFactory.make({
      functionName: "writer",
      declaredVariables: { TABLE_NAME: "gadgets" },
    });

    // When the new function's environment is checked against it.
    const warnings = warningsFrom(() => {
      new SimLambdaEnvironmentConflicts().check(environment, [existing]);
    });

    // Then both function names are reported with the variable name.
    assertArrayLength(warnings, 1);
    assertStringIncludes(warnings[0], "reader");
    assertStringIncludes(warnings[0], "writer");
    assertStringIncludes(warnings[0], "TABLE_NAME");
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
    // Given a conflict that would be found again by a later function.
    const conflicts = new SimLambdaEnvironmentConflicts();
    const existing = simLambdaEnvironmentFactory.make({
      functionName: "reader",
      declaredVariables: { TABLE_NAME: "widgets" },
    });

    // When two more functions are checked against it.
    const warnings = warningsFrom(() => {
      conflicts.check(
        simLambdaEnvironmentFactory.make({
          functionName: "writer",
          declaredVariables: { TABLE_NAME: "gadgets" },
        }),
        [existing],
      );
      conflicts.check(
        simLambdaEnvironmentFactory.make({
          functionName: "deleter",
          declaredVariables: { TABLE_NAME: "sprockets" },
        }),
        [existing],
      );
    });

    // Then the same variable name is only reported the first time.
    assertArrayLength(warnings, 1);
  });
});
