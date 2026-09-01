import {
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { CreateTopicCommand } from "@aws-sdk/client-sns";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  invokeAsyncAndSettle,
  makeQueue,
  putEventInvokeConfig,
  receivedBodies,
  receivedRecord,
  simAwsWithAsyncFunction,
  simLambdaAsyncFunctionName,
  simLambdaQueueArn,
} from "../../../../../../test/lambda/async-destination-fixture.js";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../../../test/sns/subscription-fixture.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../index.js";

describe("Lambda dead-letter config", () => {
  it("sends the invoked event to a dead-letter queue when every attempt fails", async () => {
    // Given a failing function with a dead-letter queue.
    const deadLetterArn = simLambdaQueueArn("orders-dlq");
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: simLambdaQueueArn("orders-dlq"),
      roleActions: ["sqs:SendMessage"],
      roleResource: deadLetterArn,
    });
    const queueUrl = await makeQueue(simAws, "orders-dlq");
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });

    // When it is invoked asynchronously and the retries fall due.
    await invokeAsyncAndSettle(simAws);

    // Then the queue holds the event as it was invoked, with none of the
    // envelope a destination record carries.
    const [body] = await receivedBodies(simAws, queueUrl);
    assertNonNullable(body, "the dead-letter queue received the event");
    assertObjectEquals(JSON.parse(body) as object, { id: 7 });
  });

  it("publishes the invoked event to an allowed dead-letter topic", async () => {
    // Given a failing function whose execution Role may publish to its
    // dead-letter topic.
    const topicArn = "arn:aws:sns:us-east-1:888888888888:orders-failures";
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: topicArn,
      roleActions: ["sns:Publish"],
      roleResource: topicArn,
    });
    const created = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders-failures" }));
    assertIdentical(created.TopicArn, topicArn);
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "dead-letter-subscriber",
      topicArn,
    );
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });

    // When every invocation attempt fails.
    await invokeAsyncAndSettle(simAws);

    // Then the topic publishes the original event to its subscriber.
    const body = await simSnsDeliveredMessage(simAws, queueUrl);
    assertNonNullable(body, "the topic delivered a message");
    const envelope = JSON.parse(body) as { readonly Message: string };
    assertObjectEquals(JSON.parse(envelope.Message) as object, { id: 7 });
  });

  it("refuses a dead-letter queue the execution role may not send to", async () => {
    // Given a failing function whose execution Role cannot send to its
    // dead-letter queue.
    const deadLetterArn = simLambdaQueueArn("orders-dlq");
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: deadLetterArn,
      roleActions: ["lambda:GetFunction"],
    });
    const queueUrl = await makeQueue(simAws, "orders-dlq");
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });

    // When every invocation attempt fails.
    const error = await assertThrowsErrorAsync(async () => {
      await invokeAsyncAndSettle(simAws);
    });

    // Then IAM refuses the execution Role and the queue remains empty.
    assertStringIncludes(error.message, "role/OrdersRole");
    assertStringIncludes(error.message, "sqs:SendMessage");
    assertStringIncludes(error.message, deadLetterArn);
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("refuses a dead-letter topic the execution role may not publish to", async () => {
    // Given a failing function whose execution Role cannot publish to its
    // dead-letter topic.
    const topicArn = "arn:aws:sns:us-east-1:888888888888:orders-failures";
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: topicArn,
      roleActions: ["lambda:GetFunction"],
    });
    await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders-failures" }));
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "dead-letter-subscriber",
      topicArn,
    );
    await putEventInvokeConfig(simAws, { MaximumRetryAttempts: 0 });

    // When every invocation attempt fails.
    const error = await assertThrowsErrorAsync(async () => {
      await invokeAsyncAndSettle(simAws);
    });

    // Then IAM refuses the execution Role and the subscriber receives nothing.
    assertStringIncludes(error.message, "role/OrdersRole");
    assertStringIncludes(error.message, "sns:Publish");
    assertStringIncludes(error.message, topicArn);
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("leaves the dead-letter queue empty when a retry succeeds", async () => {
    // Given a function that fails once and then works.
    const { simAws } = await simAwsWithAsyncFunction({
      failuresBeforeSuccess: 1,
      deadLetterTargetArn: simLambdaQueueArn("orders-dlq"),
    });
    const queueUrl = await makeQueue(simAws, "orders-dlq");

    // When it is invoked asynchronously and the retry falls due.
    await invokeAsyncAndSettle(simAws);

    // Then nothing was dead-lettered.
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("tells both a failure destination and a dead-letter target", async () => {
    // Given a failing function carrying both.
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: simLambdaQueueArn("orders-dlq"),
    });
    const deadLetterUrl = await makeQueue(simAws, "orders-dlq");
    const failuresUrl = await makeQueue(simAws, "failures");
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnFailure: simLambdaQueueArn("failures"),
    });

    // When it is invoked asynchronously and the retries fall due.
    await invokeAsyncAndSettle(simAws);

    // Then each mechanism answered for itself.
    const record = await receivedRecord(simAws, failuresUrl);
    assertIdentical(record.requestContext.condition, "RetriesExhausted");
    assertArrayLength(await receivedBodies(simAws, deadLetterUrl), 1);
  });

  it("reports and changes a function's dead-letter target", async () => {
    // Given a function created with a dead-letter queue.
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: simLambdaQueueArn("orders-dlq"),
    });

    // Then GetFunction reports it.
    const before = await simAws
      .lambda()
      .getFunction(
        new GetFunctionCommand({ FunctionName: simLambdaAsyncFunctionName }),
      );
    assertIdentical(
      before.Configuration.DeadLetterConfig?.TargetArn,
      simLambdaQueueArn("orders-dlq"),
    );

    // When the target is moved to a topic.
    const after = await simAws.lambda().updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: simLambdaAsyncFunctionName,
        DeadLetterConfig: {
          TargetArn: "arn:aws:sns:us-east-1:888888888888:orders-failures",
        },
      }),
    );

    // Then the function dead-letters there instead.
    assertIdentical(
      after.DeadLetterConfig?.TargetArn,
      "arn:aws:sns:us-east-1:888888888888:orders-failures",
    );
  });

  it("takes a dead-letter target away when the config arrives empty", async () => {
    // Given a function with a dead-letter queue.
    const { simAws } = await simAwsWithAsyncFunction({
      deadLetterTargetArn: simLambdaQueueArn("orders-dlq"),
    });

    // When the target is cleared.
    const updated = await simAws.lambda().updateFunctionConfiguration(
      new UpdateFunctionConfigurationCommand({
        FunctionName: simLambdaAsyncFunctionName,
        DeadLetterConfig: { TargetArn: "" },
      }),
    );

    // Then the function has none.
    assertUndefined(updated.DeadLetterConfig);
  });

  it("refuses a dead-letter target that is not a queue or a topic", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a function is created dead-lettering to a function.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "orders",
          Role: "arn:aws:iam::888888888888:role/OrdersRole",
          DeadLetterConfig: {
            TargetArn: "arn:aws:lambda:us-east-1:888888888888:function:other",
          },
          Code: { ZipFile: makeLambdaZipFileInput(() => null) },
        }),
      );
    });

    // Then it is refused where the caller can see it.
    assertIdentical(
      error.message,
      "The dead-letter target arn:aws:lambda:us-east-1:888888888888:" +
        "function:other names lambda. A dead-letter target is an SQS queue " +
        "or an SNS topic.",
    );
  });
});
