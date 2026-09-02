import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertStringIncludes,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeQueue,
  putEventInvokeConfig,
  receivedRecord,
  simLambdaQueueArn,
} from "../../../../../../test/lambda/async-destination-fixture.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../../iam/role/sim-iam-role-with-policy.factory.js";
import { makeLambdaZipFileInput } from "../../../index.js";

const functionName = "orders";

/**
 * One simulation holding a function with three seconds to answer in, whose
 * handler always sleeps for a minute, and a count of how often it started.
 */
async function simAwsWithSlowFunction(): Promise<{
  readonly simAws: SimAws;
  readonly attemptCount: () => number;
}> {
  const simAws = new SimAws();
  let attempts = 0;
  const executionRole = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrdersRole",
      policyName: "DestinationDelivery",
      actions: ["sqs:SendMessage"],
      resource: "*",
    },
    simAws,
  );

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: executionRole.Arn,
      Timeout: 3,
      Code: {
        ZipFile: makeLambdaZipFileInput(async () => {
          attempts += 1;
          await new Promise((resolve) => {
            setTimeout(resolve, 60_000);
          });

          return "late";
        }),
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  return { simAws, attemptCount: (): number => attempts };
}

async function invokeAsync(simAws: SimAws): Promise<void> {
  await simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event",
      Payload: JSON.stringify({ id: 7 }),
    }),
  );
}

describe("an asynchronous sim Lambda invocation that runs out of time", () => {
  it("counts a timeout as a failed attempt and retries it", async () => {
    // Given a function whose handler never answers inside its three seconds.
    const { simAws, attemptCount } = await simAwsWithSlowFunction();

    // When it is invoked asynchronously and every retry falls due.
    await invokeAsync(simAws);
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then it ran three times, which is the first attempt and the two retries
    // real Lambda makes by default. A timeout is a failed attempt.
    assertIdentical(attemptCount(), 3);
  });

  it("leaves an attempt running while its deadline is still ahead", async () => {
    // Given a function whose handler is part way through its first attempt.
    const { simAws, attemptCount } = await simAwsWithSlowFunction();

    // When it is invoked asynchronously and time moves on by less than its
    // three seconds.
    await invokeAsync(simAws);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the advance came back rather than waiting for a handler only the
    // clock can release, and nothing has been retried.
    assertIdentical(attemptCount(), 1);
  });

  it("sends the timeout on to the failure destination", async () => {
    // Given a slow function that gives up after one retry and sends what it
    // gave up on to a queue.
    const { simAws } = await simAwsWithSlowFunction();
    const queueUrl = await makeQueue(simAws, "failures");
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 1,
      OnFailure: simLambdaQueueArn("failures"),
    });

    // When it is invoked asynchronously and both attempts run out of time.
    await invokeAsync(simAws);
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the record says the retries were exhausted, and carries the
    // timeout the last attempt ended in.
    const record = await receivedRecord(simAws, queueUrl);
    assertIdentical(record.requestContext.condition, "RetriesExhausted");
    assertIdentical(record.requestContext.approximateInvokeCount, 2);
    assertIdentical(record.responseContext?.functionError, "Unhandled");

    const payload = record.responsePayload as { errorType?: string };
    assertNonNullable(payload.errorType, "the record carries an error type");
    assertIdentical(payload.errorType, "Sandbox.Timedout");
  });

  it("dead-letters an event its function never answered", async () => {
    // Given a slow function with a dead-letter queue and no retries.
    const { simAws } = await simAwsWithSlowFunction();
    const queueUrl = await makeQueue(simAws, "abandoned");
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });
    await simAws.lambda().updateFunctionConfiguration({
      input: {
        FunctionName: functionName,
        DeadLetterConfig: { TargetArn: simLambdaQueueArn("abandoned") },
      },
    });

    // When it is invoked asynchronously and its one attempt times out.
    await invokeAsync(simAws);
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the event itself is on the dead-letter queue.
    const { Messages } = await simAws.sqs().receiveMessage({
      input: { QueueUrl: queueUrl },
    });
    const [message] = Messages ?? [];
    assertNonNullable(message?.Body, "the event was dead-lettered");
    assertStringIncludes(message.Body, '"id":7');
  });
});
