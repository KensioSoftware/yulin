import {
  CreateFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

async function createOrdersFunction(simLambda: SimLambda): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Description: "Takes orders",
      MemorySize: 512,
      Timeout: 30,
    }),
  );
}

describe("Lambda UpdateFunctionConfigurationCommand", () => {
  it("changes the settings the request names", async () => {
    // Given a function created with settings of its own.
    const simLambda = new SimLambda();
    await createOrdersFunction(simLambda);

    // When every setting simulated Lambda models is changed.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersReadRole",
        Handler: "orders.handler",
        Runtime: "nodejs24.x",
        Description: "Reads orders",
        MemorySize: 1024,
        Timeout: 5,
      }),
    );

    // Then the answer carries the new settings, and GetFunction agrees.
    assertIdentical(
      updated.Role,
      "arn:aws:iam::111111111111:role/OrdersReadRole",
    );
    assertIdentical(updated.Handler, "orders.handler");
    assertIdentical(updated.Runtime, "nodejs24.x");
    assertIdentical(updated.Description, "Reads orders");
    assertIdentical(updated.MemorySize, 1024);
    assertIdentical(updated.Timeout, 5);

    const fetched = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );
    assertIdentical(fetched.Configuration.Timeout, 5);
    assertIdentical(fetched.Configuration.Handler, "orders.handler");
  });

  it("leaves a setting the request says nothing about alone", async () => {
    // Given a function created with settings of its own.
    const simLambda = new SimLambda();
    await createOrdersFunction(simLambda);

    // When only the timeout is changed.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 5,
      }),
    );

    // Then everything else is as it was.
    assertIdentical(updated.Timeout, 5);
    assertIdentical(updated.MemorySize, 512);
    assertIdentical(updated.Handler, "index.handler");
    assertIdentical(updated.Runtime, "nodejs22.x");
    assertIdentical(updated.Description, "Takes orders");
    assertIdentical(updated.Role, "arn:aws:iam::111111111111:role/OrdersRole");
  });

  it("runs the next invocation under the new timeout and memory", async () => {
    // Given a function whose handler reports what its context says.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        MemorySize: 512,
        Timeout: 30,
        Code: {
          ZipFile: makeLambdaZipFileInput((_event, context) => ({
            memoryLimitInMB: context.memoryLimitInMB,
            remainingMs: context.getRemainingTimeInMillis(),
          })),
        },
      }),
    );

    // When the timeout and memory are changed.
    await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        MemorySize: 1024,
        Timeout: 5,
      }),
    );

    // Then the invocation runs under them.
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    const context = parsePayload(invoked.Payload) as {
      memoryLimitInMB: string;
      remainingMs: number;
    };
    assertIdentical(context.memoryLimitInMB, "1024");
    assertIdentical(context.remainingMs, 5000);
  });

  it("fails for a function name that belongs to no function", async () => {
    const simLambda = new SimLambda();

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionConfiguration(
        new UpdateFunctionConfigurationCommand({
          FunctionName: "absent",
          Timeout: 5,
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("refuses a qualified function name", async () => {
    // Given a function with settings that could be changed.
    const simLambda = new SimLambda();
    await createOrdersFunction(simLambda);

    // When an update names a version of it.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionConfiguration(
        new UpdateFunctionConfigurationCommand({
          FunctionName: "orders:1",
          Timeout: 5,
        }),
      ),
    );

    // Then it is refused, because a published version's settings never change.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "not permitted on a qualified");
  });

  it("leaves a function with no description reporting none", async () => {
    // Given a function created without a description.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
      }),
    );

    // When something else is changed.
    const updated = await simLambda.updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: "orders",
        Timeout: 5,
      }),
    );

    // Then it still has none.
    assertUndefined(updated.Description);
  });
});
