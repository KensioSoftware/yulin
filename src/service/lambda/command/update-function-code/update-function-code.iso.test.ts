import {
  CreateFunctionCommand,
  InvokeCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaCodeZip } from "../../function/code/make-lambda-code-zip.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda UpdateFunctionCodeCommand", () => {
  it("replaces what an invocation runs", async () => {
    // Given a function created with one handler.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    // When its code is replaced with another handler.
    await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // Then an invocation runs the replacement.
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "second");
  });

  it("answers with the updated function's configuration", async () => {
    // Given a function described at creation.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
        MemorySize: 512,
        Timeout: 30,
        Description: "Takes orders",
      }),
    );

    // When its code is replaced.
    const updated = await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => "second"),
      }),
    );

    // Then everything the function was created with still describes it.
    assertIdentical(updated.Version, "$LATEST");
    assertIdentical(updated.MemorySize, 512);
    assertIdentical(updated.Timeout, 30);
    assertIdentical(updated.Description, "Takes orders");
    assertIdentical(updated.Role, "arn:aws:iam::111111111111:role/OrdersRole");
  });

  it("keeps the environment variables the function was created with", async () => {
    // Given a function whose handler reads a declared variable.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
        Environment: { Variables: { ORDERS_TABLE: "orders-v1" } },
      }),
    );

    // When its code is replaced with a handler that reads the same variable.
    await simLambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaZipFileInput(() => process.env["ORDERS_TABLE"]),
      }),
    );

    // Then the replacement reads the value the function already had.
    const invoked = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(invoked.Payload), "orders-v1");
  });

  it("runs replacement zip code under the function's own Handler", async () => {
    // Given a function created from zip source code with a named handler.
    const simAws = new SimAws();
    const lambda = simAws.lambda();
    await lambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Handler: "index.handler",
        Runtime: "nodejs22.x",
        Code: {
          ZipFile: makeLambdaCodeZip("exports.handler = async () => 1;"),
        },
      }),
    );

    // When the zip is replaced, without naming a Handler again.
    await lambda.updateFunctionCode(
      new UpdateFunctionCodeCommand({
        FunctionName: "orders",
        ZipFile: makeLambdaCodeZip("exports.handler = async () => 2;"),
      }),
    );

    // Then the new source ran under the handler the function already had.
    const invoked = await lambda.invoke(
      new InvokeCommand({ FunctionName: "orders" }),
    );
    assertIdentical(parsePayload(invoked.Payload), 2);

    await simAws.backgroundTasksComplete();
  });

  it("refuses zip code for a function with no Handler to run it under", async () => {
    // Given a function created from a real in-process handler, which needs no
    // Handler name of its own.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    // When its code is replaced with zip source code.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "orders",
          ZipFile: makeLambdaCodeZip("exports.handler = async () => 1;"),
        }),
      ),
    );

    // Then the refusal says which command sets a Handler.
    assertStringIncludes(error.message, "has no Handler");
    assertStringIncludes(error.message, "UpdateFunctionConfiguration");
  });

  it("fails for a function name that belongs to no function", async () => {
    const simLambda = new SimLambda();

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "absent",
          ZipFile: makeLambdaZipFileInput(() => "second"),
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(error.message, "Function not found");
  });

  it("refuses a qualified function name", async () => {
    // Given a function with a published version.
    const simLambda = new SimLambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first") },
      }),
    );

    // When an update names that version.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.updateFunctionCode(
        new UpdateFunctionCodeCommand({
          FunctionName: "orders:1",
          ZipFile: makeLambdaZipFileInput(() => "second"),
        }),
      ),
    );

    // Then it is refused, because a published version's code never changes.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "not permitted on a qualified");
  });
});
