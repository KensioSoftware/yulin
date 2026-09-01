import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { CreateTopicCommand } from "@aws-sdk/client-sns";
import { SetQueueAttributesCommand } from "@aws-sdk/client-sqs";
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
  simLambdaAsyncFunctionArn,
  simLambdaAsyncFunctionName,
  simLambdaQueueArn,
} from "../../../../../../test/lambda/async-destination-fixture.js";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../../../test/sns/subscription-fixture.js";
import type { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../index.js";
import type { SimLambdaDestinationRecord } from "../../../destination/sim-lambda-destination-record.js";

/**
 * A rule on the default bus sending the invocation results Lambda puts there
 * on to a queue, with the queue policy EventBridge delivery needs.
 */
async function ruleToQueue(
  simAws: SimAws,
  queueUrl: string,
  queueName: string,
): Promise<void> {
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: simLambdaQueueArn(queueName),
      },
    ],
  });
  await simAws.sqs().setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: { Policy: policy },
    }),
  );
  await simAws.eventBridge().putRule(
    new PutRuleCommand({
      Name: "invocation-results",
      EventPattern: JSON.stringify({ source: ["lambda"] }),
    }),
  );
  await simAws.eventBridge().putTargets(
    new PutTargetsCommand({
      Rule: "invocation-results",
      Targets: [{ Id: "results", Arn: simLambdaQueueArn(queueName) }],
    }),
  );
}

describe("Lambda asynchronous invocation destinations", () => {
  it("sends a record to an OnFailure queue once the retries are exhausted", async () => {
    // Given a failing function sending its failures to a queue.
    const { simAws } = await simAwsWithAsyncFunction({
      roleActions: ["sqs:SendMessage"],
      roleResource: simLambdaQueueArn("failures"),
    });
    const queueUrl = await makeQueue(simAws, "failures");
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 1,
      OnFailure: simLambdaQueueArn("failures"),
    });

    // When it is invoked asynchronously and every retry falls due.
    await invokeAsyncAndSettle(simAws);

    // Then the queue holds the record real Lambda would have sent.
    const record = await receivedRecord(simAws, queueUrl);
    assertIdentical(record.version, "1.0");
    assertIdentical(record.requestContext.condition, "RetriesExhausted");
    assertIdentical(record.requestContext.approximateInvokeCount, 2);
    assertIdentical(
      record.requestContext.functionArn,
      simLambdaAsyncFunctionArn,
    );
    assertObjectEquals(record.requestPayload as object, { id: 7 });
    assertIdentical(record.responseContext?.functionError, "Unhandled");
  });

  it("sends a record to an OnSuccess topic when the handler returns", async () => {
    // Given a function that works, publishing its successes to a topic.
    const topicArn = "arn:aws:sns:us-east-1:888888888888:results";
    const { simAws } = await simAwsWithAsyncFunction({
      failuresBeforeSuccess: 0,
      roleActions: ["sns:Publish"],
      roleResource: topicArn,
    });
    const created = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "results" }));
    assertNonNullable(created.TopicArn, "CreateTopic answered with an ARN");
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "results-queue",
      created.TopicArn,
    );
    await putEventInvokeConfig(simAws, { OnSuccess: created.TopicArn });

    // When it is invoked asynchronously.
    await invokeAsyncAndSettle(simAws);

    // Then the record reached the topic's subscriber.
    const body = await simSnsDeliveredMessage(simAws, queueUrl);
    assertNonNullable(body, "the topic delivered a message");
    const envelope = JSON.parse(body) as { readonly Message: string };
    const record = JSON.parse(envelope.Message) as SimLambdaDestinationRecord;
    assertIdentical(record.requestContext.condition, "Success");
    assertObjectEquals(record.responsePayload as object, { handled: 7 });
  });

  it("invokes a function destination with the record", async () => {
    // Given a failing function sending its failures to another function.
    const destinationArn =
      "arn:aws:lambda:us-east-1:888888888888:function:repairs";
    const { simAws } = await simAwsWithAsyncFunction({
      roleActions: ["lambda:InvokeFunction"],
      roleResource: destinationArn,
    });
    const handled: unknown[] = [];
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "repairs",
        Role: "arn:aws:iam::888888888888:role/RepairsRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            handled.push(event);
            return null;
          }),
        },
      }),
    );
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnFailure: destinationArn,
    });

    // When the failing function is invoked asynchronously.
    await invokeAsyncAndSettle(simAws);

    // Then the destination function ran with the record.
    assertArrayLength(handled, 1);
    const record = handled[0] as SimLambdaDestinationRecord;
    assertIdentical(record.requestContext.condition, "RetriesExhausted");
  });

  it("puts a record on an event bus destination", async () => {
    // Given a failing function sending its failures to the default bus, and a
    // rule carrying what lands there on to a queue.
    const busArn = "arn:aws:events:us-east-1:888888888888:event-bus/default";
    const { simAws } = await simAwsWithAsyncFunction({
      roleActions: ["events:PutEvents"],
      roleResource: busArn,
    });
    const queueUrl = await makeQueue(simAws, "results-queue");
    await ruleToQueue(simAws, queueUrl, "results-queue");
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnFailure: busArn,
    });

    // When the function is invoked asynchronously.
    await invokeAsyncAndSettle(simAws);
    await simAws.backgroundTasksComplete();

    // Then the event carried the record in its detail.
    const [body] = await receivedBodies(simAws, queueUrl);
    assertNonNullable(body, "the rule delivered an event");
    const event = JSON.parse(body) as {
      readonly "detail-type": string;
      readonly detail: SimLambdaDestinationRecord;
    };
    assertIdentical(
      event["detail-type"],
      "Lambda Function Invocation Result - Failure",
    );
    assertIdentical(event.detail.requestContext.condition, "RetriesExhausted");
  });

  it("sends nothing anywhere for a RequestResponse invocation", async () => {
    // Given a failing function with both destinations configured.
    const { simAws } = await simAwsWithAsyncFunction();
    const queueUrl = await makeQueue(simAws, "failures");
    await putEventInvokeConfig(simAws, {
      OnFailure: simLambdaQueueArn("failures"),
      OnSuccess: simLambdaQueueArn("failures"),
    });

    // When it is invoked and waited on rather than left to run.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: simLambdaAsyncFunctionName }));
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the caller was told about the failure and the queue holds nothing,
    // because destinations belong to asynchronous invocation alone.
    assertIdentical(output.FunctionError, "Unhandled");
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("abandons an event that outlives its maximum age", async () => {
    // Given a failing function that keeps an event for a minute.
    const { simAws, attemptCount } = await simAwsWithAsyncFunction();
    const queueUrl = await makeQueue(simAws, "failures");
    await putEventInvokeConfig(simAws, {
      MaximumEventAgeInSeconds: 60,
      OnFailure: simLambdaQueueArn("failures"),
    });

    // When it is invoked asynchronously and the retries fall due.
    await invokeAsyncAndSettle(simAws);

    // Then the event was given up on at the first retry, which is where the
    // minute ran out, and the record says why.
    assertIdentical(attemptCount(), 1);
    const record = await receivedRecord(simAws, queueUrl);
    assertIdentical(record.requestContext.condition, "EventAgeExceeded");
    assertUndefined(record.responseContext);
  });

  it("refuses a queue destination the execution role may not send to", async () => {
    // Given a failing function whose execution Role cannot send to its queue
    // destination.
    const { simAws } = await simAwsWithAsyncFunction({
      roleActions: ["lambda:GetFunction"],
    });
    const queueUrl = await makeQueue(simAws, "failures");
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnFailure: simLambdaQueueArn("failures"),
    });

    // When its failure record is delivered.
    const error = await assertThrowsErrorAsync(async () => {
      await invokeAsyncAndSettle(simAws);
    });

    // Then IAM refuses the execution Role and the queue remains empty.
    assertStringIncludes(error.message, "role/OrdersRole");
    assertStringIncludes(error.message, "sqs:SendMessage");
    assertStringIncludes(error.message, simLambdaQueueArn("failures"));
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("refuses a topic destination the execution role may not publish to", async () => {
    // Given a successful function whose execution Role cannot publish to its
    // topic destination.
    const { simAws } = await simAwsWithAsyncFunction({
      failuresBeforeSuccess: 0,
      roleActions: ["lambda:GetFunction"],
    });
    const created = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "results" }));
    assertNonNullable(created.TopicArn, "CreateTopic answered with an ARN");
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "results-queue",
      created.TopicArn,
    );
    await putEventInvokeConfig(simAws, { OnSuccess: created.TopicArn });

    // When its success record is delivered.
    const error = await assertThrowsErrorAsync(async () => {
      await invokeAsyncAndSettle(simAws);
    });

    // Then IAM refuses the execution Role and the subscriber receives nothing.
    assertStringIncludes(error.message, "role/OrdersRole");
    assertStringIncludes(error.message, "sns:Publish");
    assertStringIncludes(error.message, created.TopicArn);
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("refuses an event bus destination the execution role may not put to", async () => {
    // Given a failing function whose execution Role cannot put events on its
    // bus destination.
    const { simAws } = await simAwsWithAsyncFunction({
      roleActions: ["lambda:GetFunction"],
    });
    const queueUrl = await makeQueue(simAws, "results-queue");
    await ruleToQueue(simAws, queueUrl, "results-queue");
    const busArn = "arn:aws:events:us-east-1:888888888888:event-bus/default";
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnFailure: busArn,
    });

    // When its failure record is delivered.
    const error = await assertThrowsErrorAsync(async () => {
      await invokeAsyncAndSettle(simAws);
    });

    // Then IAM refuses the execution Role and no rule receives an event.
    assertStringIncludes(error.message, "role/OrdersRole");
    assertStringIncludes(error.message, "events:PutEvents");
    assertStringIncludes(error.message, busArn);
    assertArrayEmpty(await receivedBodies(simAws, queueUrl));
  });

  it("refuses a function destination the execution role may not invoke", async () => {
    // Given a failing function whose execution Role cannot invoke its function
    // destination.
    const { simAws } = await simAwsWithAsyncFunction({
      roleActions: ["lambda:GetFunction"],
    });
    const handled: unknown[] = [];
    const destinationArn =
      "arn:aws:lambda:us-east-1:888888888888:function:repairs";
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "repairs",
        Role: "arn:aws:iam::888888888888:role/RepairsRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            handled.push(event);
            return null;
          }),
        },
      }),
    );
    await putEventInvokeConfig(simAws, {
      MaximumRetryAttempts: 0,
      OnFailure: destinationArn,
    });

    // When its failure record is delivered.
    const error = await assertThrowsErrorAsync(async () => {
      await invokeAsyncAndSettle(simAws);
    });

    // Then IAM refuses the execution Role and the destination does not run.
    assertStringIncludes(error.message, "role/OrdersRole");
    assertStringIncludes(error.message, "lambda:InvokeFunction");
    assertStringIncludes(error.message, destinationArn);
    assertArrayEmpty(handled);
  });
});
