import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeConsumerFunction,
  makePollingRole,
  makeSourceQueue,
  recordingHandler,
  simAwsWithSqsEventSource,
} from "../../../../test/lambda/event-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("sim Lambda SQS event source event records", () => {
  it("carries the message attributes the sender set", async () => {
    // Given a queue mapped to a function.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource();

    // When a message with a text and a binary attribute is sent.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          source: { DataType: "String", StringValue: "checkout" },
          signature: {
            DataType: "Binary",
            BinaryValue: new TextEncoder().encode("sig"),
          },
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the record carries them in the event's own shape, with the binary
    // value base64 encoded as it is on real AWS.
    assertArrayLength(events, 1);

    const attributes = events[0].Records[0]?.messageAttributes;

    assertNonNullable(attributes);
    assertIdentical(attributes["source"]?.stringValue, "checkout");
    assertIdentical(attributes["source"].dataType, "String");
    assertIdentical(
      attributes["signature"]?.binaryValue,
      Buffer.from("sig").toString("base64"),
    );
    assertArrayLength(attributes["signature"].stringListValues, 0);
  });

  it("waits for a delayed message to become receivable", async () => {
    // Given a queue mapped to a function.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource();

    // When a message is sent with a delay.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        DelaySeconds: 10,
      }),
    );
    await simAws.backgroundTasksComplete();

    const beforeDelay = events.length;

    // Then it arrives once simulated time reaches the end of the delay.
    await simAws.clock().advanceBy({ seconds: 11 });

    assertIdentical(beforeDelay, 0);
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });

  it("delivers nothing while the mapping is disabled", async () => {
    // Given a mapping created disabled.
    const simAws = new SimAws();
    const { queueUrl, queueArn } = await makeSourceQueue(simAws);
    const roleArn = await makePollingRole(simAws, queueArn);
    const { handler, events } = recordingHandler();
    const functionName = await makeConsumerFunction(simAws, roleArn, handler);
    const mapping = await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queueArn,
        FunctionName: functionName,
        Enabled: false,
      }),
    );

    // When a message is sent to the queue.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then nothing was delivered, and the mapping says why.
    assertArrayLength(events, 0);
    assertIdentical(
      simAws.lambda().getSimEventSourceMapping(mapping.UUID)?.state,
      "Disabled",
    );
  });

  it("surfaces a polling failure when the role loses its access", async () => {
    // Given a mapping whose execution role is denied the queue after it was
    // created.
    const { simAws, queueUrl, queueArn } = await simAwsWithSqsEventSource();

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrderConsumerRole",
        PolicyName: "NoMoreOrders",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Deny", Action: "sqs:*", Resource: queueArn },
        }),
      }),
    );

    // When a message is sent for it to poll.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // Then the simulation reports the failure rather than quietly delivering
    // nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.backgroundTasksComplete();
    });

    assertStringIncludes(error.message, "sqs:GetQueueAttributes");
  });
});
