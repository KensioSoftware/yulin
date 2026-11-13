import {
  CreateEventSourceMappingCommand,
  UpdateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringMatches,
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
import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";
import type { SimLambdaSqsEvent } from "./poll/sim-lambda-sqs-event.js";

describe("sim Lambda SQS event source mapping on a FIFO queue", () => {
  const fifoQueue = {
    queueName: "orders.fifo",
    queueAttributes: { FifoQueue: "true", VisibilityTimeout: "30" },
  };

  const send = async (
    simAws: SimAws,
    queueUrl: string,
    group: string,
    body: string,
  ): Promise<void> => {
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageGroupId: group,
        MessageDeduplicationId: body,
      }),
    );
  };

  const bodiesOf = (events: readonly SimLambdaSqsEvent[]): string[][] =>
    events.map((event) => event.Records.map((record) => record.body));

  it("delivers each message group in order", async () => {
    // Given a FIFO queue mapped to a function, holding two groups' messages
    // sent interleaved.
    const simAws = new SimAws();
    const { queueUrl, events } = await simAwsWithSqsEventSource({
      ...fifoQueue,
      simAws,
    });

    // When they are sent and delivered.
    await send(simAws, queueUrl, "a", "a-1");
    await send(simAws, queueUrl, "b", "b-1");
    await send(simAws, queueUrl, "a", "a-2");
    await simAws.backgroundTasksComplete();

    // Then every message arrives, each group's in the order it was sent.
    const delivered = bodiesOf(events).flat();

    assertArrayEquals(
      delivered.filter((body) => body.startsWith("a")),
      ["a-1", "a-2"],
    );
    assertArrayLength(delivered, 3);
  });

  it("carries the FIFO attributes in each record", async () => {
    // Given a FIFO queue mapped to a function.
    const simAws = new SimAws();
    const { queueUrl, events } = await simAwsWithSqsEventSource({
      ...fifoQueue,
      simAws,
    });

    // When a message is delivered.
    await send(simAws, queueUrl, "a", "a-1");
    await simAws.backgroundTasksComplete();

    // Then its record names its group and deduplication id.
    const attributes = events[0]?.Records[0]?.attributes;

    assertNonNullable(attributes);
    assertIdentical(attributes["MessageGroupId"], "a");
    assertIdentical(attributes["MessageDeduplicationId"], "a-1");
    assertStringMatches(attributes["SequenceNumber"] ?? "", /^\d{20}$/u);
  });

  it("holds a failed group back until its retry, delivering others", async () => {
    // Given a FIFO queue mapped to a function that fails group a's message.
    const simAws = new SimAws();
    const { queueUrl, events } = await simAwsWithSqsEventSource({
      ...fifoQueue,
      simAws,
      handlerResult: (event): undefined => {
        if (event.Records.some((record) => record.body === "a-1")) {
          throw new Error("Consumer could not handle a-1");
        }

        return undefined;
      },
    });

    // When group a's first message fails, and more arrive for both groups.
    await send(simAws, queueUrl, "a", "a-1");
    await simAws.backgroundTasksComplete();
    await send(simAws, queueUrl, "a", "a-2");
    await send(simAws, queueUrl, "b", "b-1");
    await simAws.backgroundTasksComplete();

    // Then group b is delivered and group a waits behind its failed message.
    assertArrayEquals(bodiesOf(events), [["a-1"], ["b-1"]]);

    // And once the visibility timeout lapses, group a comes back in order.
    await simAws.clock().advanceBy({ seconds: 31 });

    assertArrayEquals(bodiesOf(events)[2] ?? [], ["a-1", "a-2"]);
  });

  it("refuses a batch size above ten", async () => {
    // Given a FIFO queue and a function allowed to poll it.
    const simAws = new SimAws();
    const queue = await makeSourceQueue(
      simAws,
      fifoQueue.queueAttributes,
      fifoQueue.queueName,
    );
    const roleArn = await makePollingRole(simAws, queue.queueArn);
    const functionName = await makeConsumerFunction(
      simAws,
      roleArn,
      recordingHandler().handler,
    );

    // When a mapping asks for batches of eleven with a batching window.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().createEventSourceMapping(
        new CreateEventSourceMappingCommand({
          EventSourceArn: queue.queueArn,
          FunctionName: functionName,
          BatchSize: 11,
          MaximumBatchingWindowInSeconds: 1,
        }),
      );
    });

    // Then it is refused, since a FIFO queue delivers ten at most.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "a FIFO queue");
  });

  it("refuses a batching window, on create and on update", async () => {
    // Given a FIFO queue mapped to a function.
    const simAws = new SimAws();
    const { uuid } = await simAwsWithSqsEventSource({ ...fifoQueue, simAws });

    // When the mapping is given a batching window.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().updateEventSourceMapping(
        new UpdateEventSourceMappingCommand({
          UUID: uuid,
          MaximumBatchingWindowInSeconds: 5,
        }),
      );
    });

    // Then it is refused, as real Lambda refuses one for a FIFO queue.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertIdentical(
      error.message,
      "Batching window is not supported for FIFO queues",
    );
  });
});
