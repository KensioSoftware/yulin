import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertStringIncludes,
} from "@kensio/smartass";
import { randomUUID } from "node:crypto";
import { describe, it, vi } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambda } from "../../sim-lambda.js";

const roleArn = "arn:aws:iam::111111111111:role/ServiceRole";

/**
 * A variable name no other test reads, since a read outside an invocation
 * stays on record for the rest of the test run.
 */
function uniqueName(): string {
  return `YULIN_${randomUUID().replaceAll("-", "_").toUpperCase()}`;
}

/**
 * Collect the warnings printed while something runs, keeping them out of the
 * test output.
 */
async function warningsFrom(run: () => Promise<void>): Promise<string[]> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {
    /* captured, not printed */
  });

  try {
    await run();
    return warn.mock.calls.map((call) => String(call[0]));
  } finally {
    warn.mockRestore();
  }
}

/**
 * Create a function declaring the name with the given value, whose handler
 * reads it inside the invocation.
 */
async function createReader(
  simLambda: SimLambda,
  functionName: string,
  name: string,
  value: string,
): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Code: {
        // oxlint-disable-next-line security/detect-object-injection
        ZipFile: makeLambdaZipFileInput(() => ({ value: process.env[name] })),
      },
      Environment: { Variables: { [name]: value } },
    }),
  );
}

/**
 * Create two functions declaring different values for the name, one after
 * the other, and invoke both.
 */
async function createAndInvokeTwo(
  simLambda: SimLambda,
  name: string,
): Promise<void> {
  await createReader(simLambda, "user-api", name, "users");
  await createReader(simLambda, "billing-events", name, "billing");

  await Promise.all(
    ["user-api", "billing-events"].map(
      async (functionName) =>
        await simLambda.invoke(
          new InvokeCommand({ FunctionName: functionName, Payload: "{}" }),
        ),
    ),
  );
}

describe("sim Lambda warnings about an environment variable read early", () => {
  it("stays quiet when the functions differ on a name nothing read early", async () => {
    // Given a name that only the handlers read, inside their invocations.
    const name = uniqueName();
    const simLambda = new SimAws().lambda();

    // When two functions declaring different values for it are created and
    // invoked.
    const warnings = await warningsFrom(async () => {
      await createAndInvokeTwo(simLambda, name);
    });

    // Then nothing is printed, since each handler saw its own value.
    assertArrayEmpty(warnings);
  });

  it("warns once when the name was read outside an invocation", async () => {
    // Given a name read with no invocation running, as a handler module's
    // top level does when the test file imports it.
    const name = uniqueName();
    // oxlint-disable-next-line security/detect-object-injection
    void process.env[name];
    const simLambda = new SimAws().lambda();

    // When two functions declaring different values for it are created and
    // invoked.
    const warnings = await warningsFrom(async () => {
      await createAndInvokeTwo(simLambda, name);
    });

    // Then the conflict is printed once, naming both functions.
    assertArrayLength(warnings, 1);
    assertStringIncludes(warnings[0], "user-api");
    assertStringIncludes(warnings[0], "billing-events");
    assertStringIncludes(warnings[0], name);
  });
});
