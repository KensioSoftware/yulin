/* eslint-disable @typescript-eslint/naming-convention -- environment
 * variable names are UPPER_SNAKE_CASE by AWS convention, not code
 * identifier names. */
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simLambdaProcessEnvironment } from "./sim-lambda-process-environment.js";

/**
 * Resolve after the given number of microtask-ish ticks, so a test can
 * interleave two runs and prove they do not see each other's variables.
 */
async function tick(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe("sim Lambda process env", () => {
  it("gives the run its own process.env", async () => {
    // Given a variable that only the run declares.
    const variables = { TABLE_NAME: "widgets" };

    // When process.env is read inside the run.
    const insideRun = await simLambdaProcessEnvironment.run(variables, () =>
      Promise.resolve(process.env["TABLE_NAME"]),
    );

    // Then the run saw its own value, and nothing outside it did.
    assertIdentical(insideRun, "widgets");
    assertUndefined(process.env["TABLE_NAME"]);
  });

  it("keeps the run's variables across an await", async () => {
    // Given a run that reads process.env on both sides of an await.
    const read = await simLambdaProcessEnvironment.run(
      { TABLE_NAME: "widgets" },
      async () => {
        const before = process.env["TABLE_NAME"];
        await tick(2);
        return { before, after: process.env["TABLE_NAME"] };
      },
    );

    // Then asynchronous context tracking carried the variables across it.
    assertIdentical(read.before, "widgets");
    assertIdentical(read.after, "widgets");
  });

  it("hides host variables the run does not declare", async () => {
    // Given a variable set on the host process.
    process.env["YULIN_HOST_ONLY"] = "host value";

    try {
      // When a run that does not declare it reads process.env.
      const insideRun = await simLambdaProcessEnvironment.run({}, () =>
        Promise.resolve(process.env["YULIN_HOST_ONLY"]),
      );

      // Then the run did not inherit it, as a real Lambda would not.
      assertUndefined(insideRun);
      assertIdentical(process.env["YULIN_HOST_ONLY"], "host value");
    } finally {
      delete process.env["YULIN_HOST_ONLY"];
    }
  });

  it("keeps a write inside the run out of the host environment", async () => {
    // Given a run that writes to process.env, as function code may.
    await simLambdaProcessEnvironment.run({}, () => {
      process.env["YULIN_WRITTEN_IN_RUN"] = "written";
      return Promise.resolve();
    });

    // Then the host process environment is unchanged.
    assertUndefined(process.env["YULIN_WRITTEN_IN_RUN"]);
  });

  it("isolates concurrent runs from each other", async () => {
    // Given two overlapping runs declaring the same variable name.
    const [first, second] = await Promise.all([
      simLambdaProcessEnvironment.run({ TABLE_NAME: "widgets" }, async () => {
        await tick(6);
        return process.env["TABLE_NAME"];
      }),
      simLambdaProcessEnvironment.run({ TABLE_NAME: "gadgets" }, async () => {
        await tick(2);
        return process.env["TABLE_NAME"];
      }),
    ]);

    // Then each run saw only its own value, despite interleaving.
    assertIdentical(first, "widgets");
    assertIdentical(second, "gadgets");
  });

  it("reports the host variables while a run is in progress", async () => {
    // Given a variable set on the host process.
    process.env["YULIN_HOST_LOOKUP"] = "host value";

    try {
      // When the host variables are read from inside a run.
      const hostValue = await simLambdaProcessEnvironment.run(
        { YULIN_HOST_LOOKUP: "run value" },
        () =>
          Promise.resolve(
            simLambdaProcessEnvironment.hostVariables()["YULIN_HOST_LOOKUP"],
          ),
      );

      // Then the host value is still reachable, past the run's own.
      assertIdentical(hostValue, "host value");
    } finally {
      delete process.env["YULIN_HOST_LOOKUP"];
    }
  });

  it("keeps process.env assignable", async () => {
    // Given the patch is installed.
    await simLambdaProcessEnvironment.run({}, () => Promise.resolve());
    const hostVariables = process.env;

    try {
      // When something replaces process.env wholesale, as tooling may.
      process.env = { ...hostVariables, YULIN_REPLACED: "replaced" };

      // Then the replacement is what everything outside a run now reads.
      assertIdentical(process.env["YULIN_REPLACED"], "replaced");
    } finally {
      process.env = hostVariables;
    }
  });
});
