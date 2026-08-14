import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simProcessEnvironment } from "./sim-process-environment.js";

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
    const insideRun = await simProcessEnvironment.run(variables, () =>
      Promise.resolve(process.env["TABLE_NAME"]),
    );

    // Then the run saw its own value, and nothing outside it did.
    assertIdentical(insideRun, "widgets");
    assertUndefined(process.env["TABLE_NAME"]);
  });

  it("keeps the run's variables across an await", async () => {
    // Given a run that reads process.env on both sides of an await.
    const read = await simProcessEnvironment.run(
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
      const insideRun = await simProcessEnvironment.run({}, () =>
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
    await simProcessEnvironment.run({}, () => {
      process.env["YULIN_WRITTEN_IN_RUN"] = "written";
      return Promise.resolve();
    });

    // Then the host process environment is unchanged.
    assertUndefined(process.env["YULIN_WRITTEN_IN_RUN"]);
  });

  it("isolates concurrent runs from each other", async () => {
    // Given two overlapping runs declaring the same variable name.
    const [first, second] = await Promise.all([
      simProcessEnvironment.run({ TABLE_NAME: "widgets" }, async () => {
        await tick(6);
        return process.env["TABLE_NAME"];
      }),
      simProcessEnvironment.run({ TABLE_NAME: "gadgets" }, async () => {
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
      const hostValue = await simProcessEnvironment.run(
        { YULIN_HOST_LOOKUP: "run value" },
        () =>
          Promise.resolve(
            simProcessEnvironment.hostVariables()["YULIN_HOST_LOOKUP"],
          ),
      );

      // Then the host value is still reachable, past the run's own.
      assertIdentical(hostValue, "host value");
    } finally {
      delete process.env["YULIN_HOST_LOOKUP"];
    }
  });

  it("keeps a whole-object assignment inside the run", async () => {
    // Given a variable set on the host process.
    process.env["YULIN_HOST_SURVIVES"] = "host value";

    try {
      // When a run replaces process.env wholesale, as function code may.
      const insideRun = await simProcessEnvironment.run(
        { TABLE_NAME: "widgets" },
        () => {
          process.env = { REPLACED: "replaced" };
          return Promise.resolve({
            replaced: process.env["REPLACED"],
            tableName: process.env["TABLE_NAME"],
          });
        },
      );

      // Then the run saw its own replacement, and the host environment came
      // through the invocation untouched.
      assertIdentical(insideRun.replaced, "replaced");
      assertUndefined(insideRun.tableName);
      assertIdentical(process.env["YULIN_HOST_SURVIVES"], "host value");
      assertUndefined(process.env["REPLACED"]);
    } finally {
      delete process.env["YULIN_HOST_SURVIVES"];
    }
  });

  it("keeps process.env assignable", async () => {
    // Given the patch is installed.
    await simProcessEnvironment.run({}, () => Promise.resolve());
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
