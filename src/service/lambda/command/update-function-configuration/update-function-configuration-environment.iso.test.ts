import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

async function createReadingFunction(simLambda: SimLambda): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: {
        ZipFile: makeLambdaZipFileInput(() => process.env["ORDERS_TABLE"]),
      },
      Environment: { Variables: { ORDERS_TABLE: "orders-v1" } },
    }),
  );
}

describe("Lambda UpdateFunctionConfigurationCommand environment variables", () => {
  it("replaces the variables a handler reads", async () => {
    // Given a function whose handler reads a declared variable.
    const simLambda = new SimLambda();
    await createReadingFunction(simLambda);

    // When the variables are replaced.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Environment: { Variables: { ORDERS_TABLE: "orders-v2" } },
      }),
    );

    // Then the handler reads the new value.
    assertObjectEquals(updated.Environment?.Variables ?? {}, {
      ORDERS_TABLE: "orders-v2",
    });
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "orders-v2");
  });

  it("replaces the whole map rather than merging into it", async () => {
    // Given a function declaring two variables.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
        Environment: { Variables: { ORDERS_TABLE: "orders", STAGE: "live" } },
      }),
    );

    // When an update names only one of them.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Environment: { Variables: { STAGE: "test" } },
      }),
    );

    // Then the one it left out is gone, as on real Lambda.
    assertObjectEquals(updated.Environment?.Variables ?? {}, {
      STAGE: "test",
    });
  });

  it("leaves the variables alone when the request omits Environment", async () => {
    // Given a function declaring a variable.
    const simLambda = new SimLambda();
    await createReadingFunction(simLambda);

    // When something else is changed.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 5,
      }),
    );

    // Then the variable is still declared.
    assertObjectEquals(updated.Environment?.Variables ?? {}, {
      ORDERS_TABLE: "orders-v1",
    });
  });

  it("clears the variables for an empty Environment", async () => {
    // Given a function declaring a variable.
    const simLambda = new SimLambda();
    await createReadingFunction(simLambda);

    // When an empty variable map is asked for.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Environment: { Variables: {} },
      }),
    );

    // Then the function declares none, which AWS reports by leaving
    // Environment off the configuration.
    assertUndefined(updated.Environment);
  });

  it("refuses a reserved variable name as CreateFunction refuses it", async () => {
    const simLambda = new SimLambda();
    await createReadingFunction(simLambda);

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionConfiguration(
        new UpdateFunctionConfigurationCommand({
          FunctionName: "orders",
          Environment: { Variables: { AWS_REGION: "eu-west-2" } },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "reserved keys");
    assertStringIncludes(error.message, "AWS_REGION");
  });

  it("refuses a variable name that breaks the AWS name pattern", async () => {
    const simLambda = new SimLambda();
    await createReadingFunction(simLambda);

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionConfiguration(
        new UpdateFunctionConfigurationCommand({
          FunctionName: "orders",
          Environment: { Variables: { "9lives": "no" } },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaValidationException);
    assertStringIncludes(error.message, "9lives");
  });

  it("gives replaced variables to zip code running in the vm runtime", async () => {
    // Given a zip code function that has already run once, so its sandbox is
    // warm and holds the environment it started with.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: {
          ZipFile: makeLambdaCodeZip(
            "exports.handler = async () => process.env.ORDERS_TABLE;",
          ),
        },
        Environment: { Variables: { ORDERS_TABLE: "orders-v1" } },
      }),
    );
    const first = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(first.Payload), "orders-v1");

    // When the variables are replaced.
    await lambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Environment: { Variables: { ORDERS_TABLE: "orders-v2" } },
      }),
    );

    // Then the next invocation cold starts under the new ones, the way real
    // Lambda replaces the execution environment for a configuration change.
    const second = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(second.Payload), "orders-v2");

    await simAws.backgroundTasksComplete();
  });

  it("reports a changed memory size to the runtime as a variable", async () => {
    // Given a function whose handler reads the AWS-provided memory variable.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        MemorySize: 512,
        Code: {
          ZipFile: makeLambdaCodeZip(
            "exports.handler = async () => process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;",
          ),
        },
      }),
    );

    // When the memory size is changed.
    await lambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        MemorySize: 1024,
      }),
    );

    // Then the runtime variable reports the new size.
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "1024");

    await simAws.backgroundTasksComplete();
  });
});
