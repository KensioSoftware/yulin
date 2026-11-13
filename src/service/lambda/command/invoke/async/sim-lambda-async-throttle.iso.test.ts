import {
  DeleteFunctionConcurrencyCommand,
  PutFunctionConcurrencyCommand,
} from "@aws-sdk/client-lambda";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  invokeAsyncAndSettle,
  makeQueue,
  putEventInvokeConfig,
  receivedRecord,
  simAwsWithAsyncFunction,
  simLambdaAsyncFunctionName,
  simLambdaQueueArn,
} from "../../../../../../test/lambda/async-destination-fixture.js";

describe("an asynchronous invocation the function's reservation throttles", () => {
  it("keeps trying a throttled event without spending its retries", async () => {
    // Given a function that succeeds, allowed no retries, and switched off
    // with a reservation of zero.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction({
      failuresBeforeSuccess: 0,
    });
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });
    await simAws.lambda().putFunctionConcurrency(
      new PutFunctionConcurrencyCommand({
        FunctionName: simLambdaAsyncFunctionName,
        ReservedConcurrentExecutions: 0,
      }),
    );

    // When it is invoked asynchronously, and switched back on an hour later.
    await invokeAsyncAndSettle(simAws);
    await simAws.clock().advanceBy({ hours: 1 });
    const whileThrottled = attemptCount();
    await simAws.lambda().deleteFunctionConcurrency(
      new DeleteFunctionConcurrencyCommand({
        FunctionName: simLambdaAsyncFunctionName,
      }),
    );
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the handler never ran while throttled, and ran once after.
    assertIdentical(whileThrottled, 0);
    assertIdentical(attemptCount(), 1);
  });

  it("gives a throttled event up once it is older than its maximum age", async () => {
    // Given a function kept switched off, whose events last a minute and
    // whose failures go to a queue.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction();
    const queueUrl = await makeQueue(simAws, "order-failures");
    await putEventInvokeConfig(simAws, {
      MaximumEventAgeInSeconds: 60,
      OnFailure: simLambdaQueueArn("order-failures"),
    });
    await simAws.lambda().putFunctionConcurrency(
      new PutFunctionConcurrencyCommand({
        FunctionName: simLambdaAsyncFunctionName,
        ReservedConcurrentExecutions: 0,
      }),
    );

    // When it is invoked asynchronously and the minute passes.
    await invokeAsyncAndSettle(simAws);

    // Then the event was never run, and its failure says it aged out.
    const record = await receivedRecord(simAws, queueUrl);
    assertIdentical(attemptCount(), 0);
    assertIdentical(record.requestContext.condition, "EventAgeExceeded");
  });
});
