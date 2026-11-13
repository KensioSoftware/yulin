import {
  CreateFunctionCommand,
  InvokeCommand,
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
  simLambdaDestinationActions,
  simLambdaQueueArn,
} from "../../../../../../test/lambda/async-destination-fixture.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../../iam/role/sim-iam-role-with-policy.factory.js";
import { makeLambdaCodeZip } from "../../../function/code/make-lambda-code-zip.js";

/**
 * Function code answering an event at once, or ten minutes of simulated time
 * later for an event asking to be slow.
 */
const ordersCode =
  "exports.handler = async (event) => {\n" +
  "  if (event.slow) {\n" +
  "    await new Promise((resolve) => setTimeout(resolve, 600000));\n" +
  "  }\n" +
  "  return event.id;\n" +
  "};\n";

describe("an asynchronous invocation the function's reservation throttles", () => {
  it("keeps trying a throttled event without spending its retries", async () => {
    // Given a function with one execution reserved and no retries, sending
    // successes to a queue.
    const simAws = new SimAws();
    simAws.clock().freeze();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrdersRole",
        policyName: "DestinationDelivery",
        actions: simLambdaDestinationActions,
        resource: "*",
      },
      simAws,
    );
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: simLambdaAsyncFunctionName,
        Role: role.Arn,
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(ordersCode) },
      }),
    );
    const queueUrl = await makeQueue(simAws, "order-successes");
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnSuccess: simLambdaQueueArn("order-successes"),
    });
    await simAws.lambda().putFunctionConcurrency(
      new PutFunctionConcurrencyCommand({
        FunctionName: simLambdaAsyncFunctionName,
        ReservedConcurrentExecutions: 1,
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a slow invocation holds the one execution, an event arrives, and
    // the slow one finishes ten minutes later.
    const slow = simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: simLambdaAsyncFunctionName,
        Payload: JSON.stringify({ slow: true, id: 1 }),
      }),
    );
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: simLambdaAsyncFunctionName,
        InvocationType: "Event",
        Payload: JSON.stringify({ id: 2 }),
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 20 });
    await slow;

    // Then the event ran once the execution was free, though it had no
    // retries to spend.
    const record = await receivedRecord(simAws, queueUrl);
    assertIdentical(record.requestContext.condition, "Success");
    assertIdentical(record.responsePayload, 2);
  });

  it("gives an event up at once for a function with none reserved", async () => {
    // Given a function switched off with a reservation of zero, whose
    // failures go to a queue.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction();
    const queueUrl = await makeQueue(simAws, "order-failures");
    await putEventInvokeConfig(simAws, {
      OnFailure: simLambdaQueueArn("order-failures"),
    });
    await simAws.lambda().putFunctionConcurrency(
      new PutFunctionConcurrencyCommand({
        FunctionName: simLambdaAsyncFunctionName,
        ReservedConcurrentExecutions: 0,
      }),
    );

    // When it is invoked asynchronously.
    await invokeAsyncAndSettle(simAws);

    // Then the event was never run, and went straight to the failure
    // destination.
    const record = await receivedRecord(simAws, queueUrl);
    assertIdentical(attemptCount(), 0);
    assertIdentical(record.requestContext.condition, "RetriesExhausted");
  });
});
