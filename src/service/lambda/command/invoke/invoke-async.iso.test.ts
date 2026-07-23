import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

describe("Lambda InvokeCommand asynchronous invocation types", () => {
  it("runs an Event invocation asynchronously in the background", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const handledEvents: unknown[] = [];
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "recorder",
        Role: "arn:aws:iam::111111111111:role/RecorderRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event) => {
            handledEvents.push(event);
            return null;
          }),
        },
      }),
    );

    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "recorder",
        InvocationType: "Event",
        Payload: JSON.stringify({ recorded: true }),
      }),
    );

    // The caller gets an accepted response before the handler has run.
    assertIdentical(output.StatusCode, 202);
    assertUndefined(output.Payload);
    assertArrayLength(handledEvents, 0);

    await simAws.backgroundTasksComplete();

    assertArrayLength(handledEvents, 1);
    assertObjectEquals(handledEvents[0] as object, { recorded: true });
  });

  it("does not surface asynchronous invocation handler errors", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "thrower",
        Role: "arn:aws:iam::111111111111:role/ThrowerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new Error("async boom");
          }),
        },
      }),
    );

    const output = await simLambda.invoke(
      new InvokeCommand({ FunctionName: "thrower", InvocationType: "Event" }),
    );

    assertIdentical(output.StatusCode, 202);

    // The handler error is dropped, not surfaced to background completion.
    await simAws.backgroundTasksComplete();
  });

  it("handles a DryRun invocation without invoking the handler", async () => {
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    let invocations = 0;
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "dry-runner",
        Role: "arn:aws:iam::111111111111:role/DryRunnerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            invocations += 1;
            return null;
          }),
        },
      }),
    );

    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "dry-runner",
        InvocationType: "DryRun",
      }),
    );

    assertIdentical(output.StatusCode, 204);
    assertUndefined(output.Payload);

    await simAws.backgroundTasksComplete();
    assertIdentical(invocations, 0);
  });
});
