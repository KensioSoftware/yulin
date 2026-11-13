import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaInvalidRequestContentException } from "../../error/sim-lambda.error.js";
import { SimLambdaRequestTooLargeException } from "../../error/sim-lambda-invoke.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaContext } from "../../function/sim-lambda-handler.type.js";

/**
 * A simulation holding one function that logs, then answers with the client
 * context it was given and a string of the length its event asks for.
 */
async function simAwsWithReporter(): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "reporter",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/ReporterRole`,
      Code: {
        ZipFile: makeLambdaZipFileInput(
          (event: { readonly length?: number }, context: SimLambdaContext) => {
            // oxlint-disable-next-line no-console -- the line the log tail holds
            console.log("reporting");

            return {
              clientContext: context.clientContext ?? null,
              padding: "x".repeat(event.length ?? 0),
            };
          },
        ),
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

function parsed(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);

  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

describe("what an Invoke request asks of its invocation", () => {
  it("answers LogType Tail with the end of the invocation's log", async () => {
    // Given a function that logs.
    const simAws = await simAwsWithReporter();

    // When it is invoked asking for the log tail.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "reporter", LogType: "Tail" }));

    // Then LogResult holds the invocation's lines, base64-encoded.
    assertNonNullable(output.LogResult);
    const log = Buffer.from(output.LogResult, "base64").toString();
    assertStringIncludes(log, "START RequestId:");
    assertStringIncludes(log, "reporting");
    assertStringIncludes(log, "REPORT RequestId:");
  });

  it("hands the handler the ClientContext a request carries", async () => {
    // Given a function answering with its client context.
    const simAws = await simAwsWithReporter();
    const clientContext = { custom: { tenant: "acme" } };
    const encoded = Buffer.from(JSON.stringify(clientContext)).toString(
      "base64",
    );

    // When it is invoked with a client context.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "reporter",
        ClientContext: encoded,
      }),
    );

    // Then the handler read it, decoded.
    assertObjectEquals(parsed(output.Payload), { clientContext, padding: "" });
  });

  it("refuses a ClientContext that is not base64-encoded JSON", async () => {
    const simAws = await simAwsWithReporter();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(
        new InvokeCommand({
          FunctionName: "reporter",
          ClientContext: Buffer.from("not json").toString("base64"),
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidRequestContentException);
  });

  it("refuses a request larger than its invocation type allows", async () => {
    // Given a function, and a payload of just over 1 MB.
    const simAws = await simAwsWithReporter();
    const payload = JSON.stringify({ padding: "x".repeat(1_048_576) });
    const overSixMegabytes = JSON.stringify({
      padding: "x".repeat(6_291_456),
    });

    // When it is invoked synchronously and asynchronously with it, and
    // synchronously with one of just over 6 MB.
    const synchronous = await simAws
      .lambda()
      .invoke(
        new InvokeCommand({ FunctionName: "reporter", Payload: payload }),
      );
    const asynchronous = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(
        new InvokeCommand({
          FunctionName: "reporter",
          InvocationType: "Event",
          Payload: payload,
        }),
      ),
    );
    const oversized = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(
        new InvokeCommand({
          FunctionName: "reporter",
          Payload: overSixMegabytes,
        }),
      ),
    );

    // Then only the synchronous 1 MB request is accepted.
    assertIdentical(synchronous.StatusCode, 200);
    assertInstanceOf(asynchronous, SimLambdaRequestTooLargeException);
    assertInstanceOf(oversized, SimLambdaRequestTooLargeException);
    assertStringIncludes(oversized.message, "6291456 bytes");
  });

  it("answers a response over 6 MB as a function error", async () => {
    // Given a function asked to answer with just over 6 MB.
    const simAws = await simAwsWithReporter();

    // When it is invoked.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "reporter",
        Payload: JSON.stringify({ length: 6_291_556 }),
      }),
    );

    // Then real Lambda's error stands in for the response.
    assertIdentical(output.FunctionError, "Unhandled");
    assertObjectEquals(parsed(output.Payload), {
      errorMessage:
        "Response payload size exceeded maximum allowed payload size " +
        "(6291556 bytes).",
      errorType: "Function.ResponseSizeTooLarge",
    });
  });
});
