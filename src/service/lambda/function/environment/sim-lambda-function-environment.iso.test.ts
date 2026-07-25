/* eslint-disable @typescript-eslint/naming-convention -- environment
 * variable names are UPPER_SNAKE_CASE by AWS convention, not code
 * identifier names. */
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import type { SimLambda } from "../../sim-lambda.js";

async function createFunctionWithEnvironment(
  simLambda: SimLambda,
  functionName: string,
  variables: Record<string, string> | undefined,
  handlerFunction: SimLambdaHandler,
): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::111111111111:role/GreeterRole",
      Code: { ZipFile: makeLambdaZipFileInput(handlerFunction) },
      ...(variables !== undefined && { Environment: { Variables: variables } }),
    }),
  );
}

async function invoke(
  simLambda: SimLambda,
  functionName: string,
): Promise<unknown> {
  const output = await simLambda.invoke(
    new InvokeCommand({ FunctionName: functionName, Payload: "{}" }),
  );
  assertNonNullable(output.Payload);
  return JSON.parse(Buffer.from(output.Payload).toString()) as unknown;
}

describe("sim Lambda in-process handler environment", () => {
  it("gives the handler the variables declared for its function", async () => {
    // Given a function declaring variables, backed by a real handler
    // function running in this process.
    const simLambda = new SimAws().lambda();
    await createFunctionWithEnvironment(
      simLambda,
      "greeter",
      { GREETING: "Hello", TABLE_NAME: "widgets" },
      () => ({
        greeting: process.env["GREETING"],
        tableName: process.env["TABLE_NAME"],
      }),
    );

    // When it is invoked.
    const result = await invoke(simLambda, "greeter");

    // Then the handler read its own declared variables from process.env.
    assertObjectEquals(result, { greeting: "Hello", tableName: "widgets" });
  });

  it("gives the handler the AWS runtime variables too", async () => {
    // Given a function declaring one variable of its own.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createFunctionWithEnvironment(
      simLambda,
      "greeter",
      { TABLE_NAME: "widgets" },
      () => ({
        region: process.env["AWS_REGION"],
        functionName: process.env["AWS_LAMBDA_FUNCTION_NAME"],
        version: process.env["AWS_LAMBDA_FUNCTION_VERSION"],
      }),
    );

    // When it is invoked.
    const result = await invoke(simLambda, "greeter");

    // Then the AWS-provided runtime variables are there as well.
    assertObjectEquals(result, {
      region: simAws.defaultRegionName,
      functionName: "greeter",
      version: "$LATEST",
    });
  });

  it("hides host process variables the function does not declare", async () => {
    // Given a variable set on the host process running the tests.
    process.env["YULIN_TEST_HOST_ONLY"] = "host value";

    try {
      const simLambda = new SimAws().lambda();
      await createFunctionWithEnvironment(
        simLambda,
        "greeter",
        { TABLE_NAME: "widgets" },
        () => ({ hostOnly: process.env["YULIN_TEST_HOST_ONLY"] ?? null }),
      );

      // When it is invoked.
      const result = await invoke(simLambda, "greeter");

      // Then the handler did not inherit it, as a real Lambda would not.
      assertObjectEquals(result, { hostOnly: null });
      assertIdentical(process.env["YULIN_TEST_HOST_ONLY"], "host value");
    } finally {
      delete process.env["YULIN_TEST_HOST_ONLY"];
    }
  });

  it("leaves the host environment alone for a function declaring none", async () => {
    // Given a function that declares no variables of its own.
    process.env["YULIN_TEST_SHARED"] = "host value";

    try {
      const simLambda = new SimAws().lambda();
      await createFunctionWithEnvironment(
        simLambda,
        "greeter",
        undefined,
        () => ({
          shared: process.env["YULIN_TEST_SHARED"] ?? null,
        }),
      );

      // When it is invoked.
      const result = await invoke(simLambda, "greeter");

      // Then it still reads the host process environment, as before: with
      // nothing of its own to run with, there is nothing to substitute.
      assertObjectEquals(result, { shared: "host value" });
    } finally {
      delete process.env["YULIN_TEST_SHARED"];
    }
  });

  it("keeps concurrent invocations of two functions apart", async () => {
    // Given two functions declaring different values for the same name.
    const simLambda = new SimAws().lambda();
    const readAfterDelay =
      (milliseconds: number): SimLambdaHandler =>
      async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        });
        return { tableName: process.env["TABLE_NAME"] };
      };

    await createFunctionWithEnvironment(
      simLambda,
      "reader",
      { TABLE_NAME: "widgets" },
      readAfterDelay(6),
    );
    await createFunctionWithEnvironment(
      simLambda,
      "writer",
      { TABLE_NAME: "gadgets" },
      readAfterDelay(2),
    );

    // When both are invoked at once, so their handlers interleave.
    const [reader, writer] = await Promise.all([
      invoke(simLambda, "reader"),
      invoke(simLambda, "writer"),
    ]);

    // Then each saw only its own value.
    assertObjectEquals(reader, { tableName: "widgets" });
    assertObjectEquals(writer, { tableName: "gadgets" });
  });

  it("keeps a write by the handler out of the host environment", async () => {
    // Given a handler that writes to process.env, as function code may.
    const simLambda = new SimAws().lambda();
    await createFunctionWithEnvironment(
      simLambda,
      "greeter",
      { TABLE_NAME: "widgets" },
      () => {
        process.env["YULIN_TEST_WRITTEN"] = "written";
        return { written: process.env["YULIN_TEST_WRITTEN"] };
      },
    );

    // When it is invoked.
    const result = await invoke(simLambda, "greeter");

    // Then the handler saw its own write, and the host process did not.
    assertObjectEquals(result, { written: "written" });
    assertUndefined(process.env["YULIN_TEST_WRITTEN"]);
  });
});
