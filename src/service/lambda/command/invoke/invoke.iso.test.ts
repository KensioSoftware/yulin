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
import type { SimLambda } from "../../sim-lambda.js";
import {
  SimLambdaError,
  SimLambdaInvalidRequestContentException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../function/sim-lambda-handler.type.js";

async function createGreeter(
  simLambda: SimLambda,
  handlerFunction: SimLambdaHandler<{ name: string }>,
): Promise<void> {
  await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "greeter",
      Role: "arn:aws:iam::111111111111:role/GreeterRole",
      Code: { ZipFile: makeLambdaZipFileInput(handlerFunction) },
    }),
  );
}

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("Lambda InvokeCommand", () => {
  it("invokes the handler with the request payload event", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createGreeter(simLambda, (event) => ({
      greeting: `Hello ${event.name}`,
    }));

    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(output.StatusCode, 200);
    assertIdentical(output.ExecutedVersion, "$LATEST");
    assertUndefined(output.FunctionError);
    assertObjectEquals(parsePayload(output.Payload) as object, {
      greeting: "Hello Yulin",
    });

    await simAws.backgroundTasksComplete();
  });

  it("invokes the handler with a Uint8Array request payload", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createGreeter(simLambda, (event) => ({
      greeting: `Hello ${event.name}`,
    }));

    const bytesPayload = Buffer.from(JSON.stringify({ name: "Bytes" }));
    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: bytesPayload }),
    );

    assertObjectEquals(parsePayload(output.Payload) as object, {
      greeting: "Hello Bytes",
    });
  });

  it("invokes the handler with an empty object event for an empty payload", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    let observedEvent: unknown;
    await createGreeter(simLambda, (event) => {
      observedEvent = event;
      return null;
    });

    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: "" }),
    );

    assertIdentical(output.StatusCode, 200);
    assertObjectEquals(observedEvent as object, {});
  });

  it("invokes the handler with an empty object event when no payload is given", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    let observedEvent: unknown;
    await createGreeter(simLambda, (event) => {
      observedEvent = event;
      return null;
    });

    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter" }),
    );

    assertIdentical(output.StatusCode, 200);
    assertObjectEquals(observedEvent as object, {});
    assertIdentical(parsePayload(output.Payload), null);
  });

  it("serialises an undefined handler result as a null payload", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createGreeter(simLambda, () => undefined);

    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }),
    );

    assertIdentical(parsePayload(output.Payload), null);
  });

  it("reports a handler error as an unhandled function error payload", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createGreeter(simLambda, () => {
      throw new RangeError("greeting out of range");
    });

    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }),
    );

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
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createGreeter(simLambda, () => null);

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.invoke(
        new InvokeCommand({ FunctionName: "greeter", Payload: "{not json" }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidRequestContentException);
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });

  it("throws on an unsupported payload input type", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await createGreeter(simLambda, () => null);

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.invoke(
        new InvokeCommand({
          FunctionName: "greeter",
          Payload: new Blob(["{}"]) as never,
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaError);
    assertStringIncludes(error.message, "string and Uint8Array");
  });

  it("throws on a function that does not exist", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "missing" })),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
    assertStringIncludes(
      error.message,
      `arn:aws:lambda:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:function:missing`,
    );
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("throws on undefined function name", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: undefined })),
    );

    assertStringIncludes(
      error.message,
      "InvokeCommand.input.FunctionName required",
    );
  });
});
