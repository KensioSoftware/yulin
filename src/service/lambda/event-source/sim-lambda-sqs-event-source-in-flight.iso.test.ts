import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import {
  ChangeMessageVisibilityCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
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

describe("sim Lambda SQS event source mappings and in-flight messages", () => {
  it("delivers a message that was in flight when the mapping was made", async () => {
    // Given a queue whose only message another consumer is holding.
    const simAws = new SimAws();
    const { queueUrl, queueArn } = await makeSourceQueue(simAws, {
      VisibilityTimeout: "30",
    });
    const roleArn = await makePollingRole(simAws, queueArn);
    const { handler, events } = recordingHandler();
    const functionName = await makeConsumerFunction(simAws, roleArn, handler);

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // When a mapping is created while that message is hidden, and nothing else
    // is ever sent.
    await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queueArn,
        FunctionName: functionName,
      }),
    );
    await simAws.backgroundTasksComplete();

    const beforeTimeout = events.length;

    await simAws.clock().advanceBy({ seconds: 31 });

    // Then the message reaches the function once it is receivable again,
    // rather than being stranded on the queue.
    assertIdentical(beforeTimeout, 0);
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });

  it("delivers a message another consumer took and gave back", async () => {
    // Given a mapped queue whose message another consumer has received.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      queueAttributes: { VisibilityTimeout: "30" },
    });

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    const receiptHandle = received.Messages?.[0]?.ReceiptHandle;

    assertNonNullable(receiptHandle);

    // When that consumer gives it straight back.
    await simAws.sqs().changeMessageVisibility(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the mapping is given it.
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });
});
