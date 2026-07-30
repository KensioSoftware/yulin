import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertTrue,
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

describe("sim Lambda SQS event source polling", () => {
  it("honours the batch size, never delivering more than it at once", async () => {
    // Given a queue mapped to a function two messages at a time.
    const { simAws, queueUrl, events } = await simAwsWithSqsEventSource({
      batchSize: 2,
    });

    // When five messages are sent.
    for (const body of ["1", "2", "3", "4", "5"]) {
      // eslint-disable-next-line no-await-in-loop
      await simAws
        .sqs()
        .sendMessage(
          new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
        );
    }

    await simAws.backgroundTasksComplete();

    // Then every message arrived, in batches of no more than two.
    const delivered = events.flatMap((event) => event.Records);

    assertArrayLength(delivered, 5);

    for (const event of events) {
      assertTrue(event.Records.length <= 2);
    }
  });

  it("delivers the messages already on a queue when the mapping is made", async () => {
    // Given a queue holding a message, and a function with nothing mapped to it.
    const simAws = new SimAws();
    const { queueUrl, queueArn } = await makeSourceQueue(simAws);
    const roleArn = await makePollingRole(simAws, queueArn);
    const { handler, events } = recordingHandler();
    const functionName = await makeConsumerFunction(simAws, roleArn, handler);

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    const beforeMapping = events.length;

    // When a mapping is created for the queue that already holds it.
    await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queueArn,
        FunctionName: functionName,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the message that was already there is delivered.
    assertIdentical(beforeMapping, 0);
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });
});
