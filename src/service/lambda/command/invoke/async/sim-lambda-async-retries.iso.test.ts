import { InvokeCommand } from "@aws-sdk/client-lambda";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  invokeAsyncAndSettle,
  putEventInvokeConfig,
  simAwsWithAsyncFunction,
  simLambdaAsyncFunctionName,
} from "../../../../../../test/lambda/async-destination-fixture.js";

describe("Lambda asynchronous invocation retries", () => {
  it("retries a failing handler twice when nothing says otherwise", async () => {
    // Given a function whose handler always throws.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction();

    // When it is invoked asynchronously and every retry falls due.
    await invokeAsyncAndSettle(simAws);

    // Then the handler ran three times, which is the first attempt and the
    // two retries real Lambda makes by default.
    assertIdentical(attemptCount(), 3);
  });

  it("runs the handler once when the config asks for no retries", async () => {
    // Given a failing function configured to retry nothing.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction();
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });

    // When it is invoked asynchronously.
    await invokeAsyncAndSettle(simAws);

    // Then only the first attempt happened.
    assertIdentical(attemptCount(), 1);
  });

  it("waits on the simulated clock before a retry", async () => {
    // Given a failing function.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction();

    // When it is invoked asynchronously and the clock is left alone.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: simLambdaAsyncFunctionName,
        InvocationType: "Event",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the first attempt has happened and the retries have not.
    assertIdentical(attemptCount(), 1);

    // And the first retry arrives once time reaches it.
    await simAws.clock().advanceBy({ minutes: 1 });
    assertIdentical(attemptCount(), 2);
  });

  it("stops retrying once the handler returns", async () => {
    // Given a function that fails once and then works.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction({
      failuresBeforeSuccess: 1,
    });

    // When it is invoked asynchronously and every retry falls due.
    await invokeAsyncAndSettle(simAws);

    // Then the retry that succeeded was the last one.
    assertIdentical(attemptCount(), 2);
  });
});
