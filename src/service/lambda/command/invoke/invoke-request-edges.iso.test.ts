import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  putEventInvokeConfig,
  simAwsWithAsyncFunction,
  simLambdaAsyncFunctionArn,
  simLambdaAsyncFunctionName,
} from "../../../../../test/lambda/async-destination-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaContext } from "../../function/sim-lambda-handler.type.js";

describe("the edges of what an Invoke request asks", () => {
  it("answers a handler error over 6 MB as an oversized response", async () => {
    // Given a function throwing an error with a very long message.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "verbose",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/VerboseRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput((): never => {
            throw new Error("x".repeat(7_000_000));
          }),
        },
      }),
    );

    // When it is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "verbose" }));

    // Then real Lambda's oversized response error stands in for it.
    assertNonNullable(output.Payload);
    assertStringIncludes(
      Buffer.from(output.Payload).toString(),
      "Function.ResponseSizeTooLarge",
    );
  });

  it("starts an asynchronous invocation without the caller's client context", async () => {
    // Given a function that, invoked with a client context, invokes itself
    // asynchronously and records what that invocation was handed.
    const simAws = new SimAws();
    const handed: unknown[] = [];
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "relay",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/RelayRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput(
            async (event: { again?: boolean }, context: SimLambdaContext) => {
              if (event.again === true) {
                handed.push(context.clientContext);
                return;
              }
              await simAws.lambda().invoke(
                new InvokeCommand({
                  FunctionName: "relay",
                  InvocationType: "Event",
                  Payload: JSON.stringify({ again: true }),
                }),
                {
                  caller: {
                    kind: "arn",
                    arn: `arn:aws:iam::${simAws.defaultAccountId}:root`,
                  },
                },
              );
            },
          ),
        },
      }),
    );

    // When it is invoked with a client context.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "relay",
        ClientContext: Buffer.from('{"custom":{}}').toString("base64"),
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the asynchronous invocation was handed none.
    assertArrayLength(handed, 1);
    assertUndefined(handed[0]);
  });

  it("stops a loop running through a success destination", async () => {
    // Given a function whose successes go back to itself.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction({
      failuresBeforeSuccess: 0,
    });
    await putEventInvokeConfig(simAws, {
      OnSuccess: simLambdaAsyncFunctionArn,
    });

    // When it is invoked once.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: simLambdaAsyncFunctionName,
        InvocationType: "Event",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the loop was stopped at sixteen.
    assertIdentical(attemptCount(), 16);
  });
});
