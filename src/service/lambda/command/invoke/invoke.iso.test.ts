import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
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
  SimLambdaError,
  SimLambdaInvalidRequestContentException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

const greeterRoleArn = "arn:aws:iam::111111111111:role/GreeterRole";

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda InvokeCommand", () => {
  it("invokes the handler with the request payload event", async () => {
    // Given a function greeting the name in its event.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput<{ name: string }>((event) => ({
            greeting: `Hello ${event.name}`,
          })),
        },
      }),
    );

    // When it is invoked with a JSON payload.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    // Then the handler saw the payload as its event.
    assertIdentical(output.StatusCode, 200);
    assertIdentical(output.ExecutedVersion, "$LATEST");
    assertUndefined(output.FunctionError);
    assertObjectEquals(parsePayload(output.Payload) as object, {
      greeting: "Hello Yulin",
    });

    await simAws.backgroundTasksComplete();
  });

  it("invokes the handler with a Uint8Array request payload", async () => {
    // Given a function greeting the name in its event.
    const simLambda = new SimAws().lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput<{ name: string }>((event) => ({
            greeting: `Hello ${event.name}`,
          })),
        },
      }),
    );

    // When it is invoked with the payload as bytes.
    const bytesPayload = Buffer.from(JSON.stringify({ name: "Bytes" }));
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: bytesPayload }),
    );

    // Then the bytes were read as the JSON event.
    assertObjectEquals(parsePayload(output.Payload) as object, {
      greeting: "Hello Bytes",
    });
  });

  it("invokes the handler with an empty object event for an empty payload", async () => {
    // Given a function recording the event it is given.
    const simLambda = new SimAws().lambda();
    let observedEvent: unknown;
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput((event) => {
            observedEvent = event;
            return null;
          }),
        },
      }),
    );

    // When it is invoked with an empty payload.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: "" }),
    );

    // Then the handler saw an empty object.
    assertIdentical(output.StatusCode, 200);
    assertObjectEquals(observedEvent as object, {});
  });

  it("invokes the handler with an empty object event when no payload is given", async () => {
    // Given a function recording the event it is given.
    const simLambda = new SimAws().lambda();
    let observedEvent: unknown;
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput((event) => {
            observedEvent = event;
            return null;
          }),
        },
      }),
    );

    // When it is invoked without a payload at all.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter" }),
    );

    // Then the handler saw an empty object.
    assertIdentical(output.StatusCode, 200);
    assertObjectEquals(observedEvent as object, {});
    assertIdentical(parsePayload(output.Payload), null);
  });

  it("serialises an undefined handler result as a null payload", async () => {
    // Given a function returning nothing.
    const simLambda = new SimAws().lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: { ZipFile: makeLambdaZipFileInput(() => undefined) },
      }),
    );

    // When it is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }),
    );

    // Then the response payload is null.
    assertIdentical(parsePayload(output.Payload), null);
  });

  it("reports a handler error as an unhandled function error payload", async () => {
    // Given a function whose handler throws.
    const simLambda = new SimAws().lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new RangeError("greeting out of range");
          }),
        },
      }),
    );

    // When it is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }),
    );

    // Then the failure comes back as an unhandled function error, the way real
    // Lambda reports one.
    assertIdentical(output.StatusCode, 200);
    assertIdentical(output.FunctionError, "Unhandled");
    const errorPayload = parsePayload(output.Payload) as {
      errorType: string;
      errorMessage: string;
      trace: string[];
    };
    assertIdentical(errorPayload.errorType, "RangeError");
    assertIdentical(errorPayload.errorMessage, "greeting out of range");
    assertStringIncludes(errorPayload.trace[0] ?? "", "greeting out of range");
  });

  it("throws on a payload that is not valid JSON", async () => {
    // Given a function.
    const simLambda = new SimAws().lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );

    // When it is invoked with a payload that is not JSON.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.invoke(
        new InvokeCommand({ FunctionName: "greeter", Payload: "{not json" }),
      ),
    );

    // Then the request content is rejected.
    assertInstanceOf(error, SimLambdaInvalidRequestContentException);
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });

  it("throws on an unsupported payload input type", async () => {
    // Given a function.
    const simLambda = new SimAws().lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: greeterRoleArn,
        Code: { ZipFile: makeLambdaZipFileInput(() => null) },
      }),
    );

    // When it is invoked with a payload of a type the SDK does not send.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.invoke(
        new InvokeCommand({
          FunctionName: "greeter",
          Payload: new Blob(["{}"]) as never,
        }),
      ),
    );

    // Then the unsupported type is reported.
    assertInstanceOf(error, SimLambdaError);
    assertStringIncludes(error.message, "string and Uint8Array");
  });

  it("throws on a function that does not exist", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When a missing function is invoked.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "missing" })),
    );

    // Then the missing function is named in the failure.
    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(
      error.message,
      `arn:aws:lambda:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:function:missing`,
    );
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("throws on undefined function name", async () => {
    // Given a simulated AWS with no functions.
    const simAws = new SimAws();

    // When an invocation names no function.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: undefined })),
    );

    // Then the missing input is reported.
    assertStringIncludes(
      error.message,
      "InvokeCommand.input.FunctionName required",
    );
  });
});
