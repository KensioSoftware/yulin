import {
  GetFunctionRecursionConfigCommand,
  PutFunctionRecursionConfigCommand,
} from "@aws-sdk/client-lambda";
import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertGreaterThan,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simAwsWithSqsEventSource,
  sqsPollingActions,
} from "../../../../../test/lambda/event-source-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";

/**
 * A queue mapping whose function sends every message it is handed back to
 * its own queue, up to a number of times.
 */
async function simAwsWithQueueLoop(sendsAtMost: number) {
  let sendBack = async (): Promise<void> => {
    // Replaced once the queue exists.
  };
  const fixture = await simAwsWithSqsEventSource({
    roleActions: [...sqsPollingActions, "sqs:SendMessage"],
    handlerResult: async () => {
      await sendBack();
    },
  });
  const { simAws, queueUrl, events } = fixture;
  sendBack = async (): Promise<void> => {
    if (events.length <= sendsAtMost) {
      await simAws
        .sqs()
        .sendMessage(
          new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "again" }),
        );
    }
  };
  await simAws.backgroundTasksComplete();

  return fixture;
}

/**
 * How many invocations of a function were stopped for running in a loop.
 */
async function droppedSince(
  simAws: SimAws,
  functionName: string,
  startedAt: Date,
): Promise<number> {
  const query = new GetMetricStatisticsCommand({
    Namespace: "AWS/Lambda",
    MetricName: "RecursiveInvocationsDropped",
    Dimensions: [{ Name: "FunctionName", Value: functionName }],
    StartTime: startedAt,
    EndTime: new Date(startedAt.getTime() + 600_000),
    Period: 600,
    Statistics: ["Sum"],
  });
  const { Datapoints } = await simAws.cloudWatch().getMetricStatistics(query);

  return Datapoints?.at(0)?.Sum ?? 0;
}

describe("a sim Lambda function looping through its own queue", () => {
  it("is stopped after sixteen invocations from its own queue", async () => {
    // Given a function that sends each message back to its own queue.
    const { simAws, queueUrl, functionName, events } =
      await simAwsWithQueueLoop(100);
    const startedAt = simAws.clock().now();

    // When one message starts the loop.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "first" }),
      );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then it ran sixteen times, and the stops were counted.
    assertArrayLength(events, 16);
    assertGreaterThan(await droppedSince(simAws, functionName, startedAt), 0);
  });

  it("runs on past sixteen when its recursion config allows it", async () => {
    // Given the same loop, sending back twenty times, on a function allowed
    // to recurse.
    const { simAws, queueUrl, functionName, events } =
      await simAwsWithQueueLoop(20);
    await simAws.lambda().putFunctionRecursionConfig(
      new PutFunctionRecursionConfigCommand({
        FunctionName: functionName,
        RecursiveLoop: "Allow",
      }),
    );

    // When one message starts the loop.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "first" }),
      );
    await simAws.backgroundTasksComplete();

    // Then it ran every time, and reports the setting.
    assertArrayLength(events, 21);
    const config = await simAws
      .lambda()
      .getFunctionRecursionConfig(
        new GetFunctionRecursionConfigCommand({ FunctionName: functionName }),
      );
    assertIdentical(config.RecursiveLoop, "Allow");
  });
});
