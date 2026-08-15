import {
  GetQueueAttributesCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithConsumingService } from "../../../../../test/ecs/consuming-service-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";

async function queueCounts(
  simAws: SimAws,
  queueUrl: string,
): Promise<Record<string, string>> {
  const attributes = await simAws.sqs().getQueueAttributes(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["All"],
    }),
  );

  return attributes.Attributes ?? {};
}

async function inFlightCount(
  simAws: SimAws,
  queueUrl: string,
): Promise<string | undefined> {
  const counts = await queueCounts(simAws, queueUrl);

  return counts["ApproximateNumberOfMessagesNotVisible"];
}

async function visibleCount(
  simAws: SimAws,
  queueUrl: string,
): Promise<string | undefined> {
  const counts = await queueCounts(simAws, queueUrl);

  return counts["ApproximateNumberOfMessages"];
}

describe("What drives a simulated ECS container's polling", () => {
  it("holds a delayed message back while simulated time is frozen", async () => {
    // Given a running consumer and a simulation whose clock is standing still.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService();
    simAws.clock().freeze();

    // When a message is sent that cannot be received for another minute.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        DelaySeconds: 60,
      }),
    );
    await simAws.backgroundTasksComplete();

    const whileFrozen = batches.length;

    // And time is then moved past the delay.
    await simAws.clock().advanceBy({ seconds: 60 });

    // Then nothing was delivered until the clock got there, and the poll that
    // delivered it happened because simulated time moved rather than because
    // the host waited.
    assertIdentical(whileFrozen, 0);
    assertArrayLength(batches, 1);
    assertIdentical(batches[0][0]?.Body, "order-1");
  });

  it("hands a batch back after its visibility timeout when the handler throws", async () => {
    // Given a consumer whose handler throws the first time it is called.
    let calls = 0;
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      queueAttributes: { VisibilityTimeout: "30" },
      onBatch: (): void => {
        calls += 1;

        if (calls === 1) {
          throw new Error("The order service is down");
        }
      },
    });

    simAws.clock().freeze();

    // When a message is sent and the handler throws on it.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    const afterThrowing = batches.length;
    const hiddenAfterThrowing = await inFlightCount(simAws, queueUrl);

    // And the visibility timeout runs out.
    await simAws.clock().advanceBy({ seconds: 30 });

    // Then the message was left on the queue, hidden, and handed over again
    // once it came back, this time to a handler that returned.
    assertIdentical(afterThrowing, 1);
    assertIdentical(hiddenAfterThrowing, "1");
    assertArrayLength(batches, 2);
    assertIdentical(batches[1][0]?.Body, "order-1");
    const inFlight = await inFlightCount(simAws, queueUrl);
    const visible = await visibleCount(simAws, queueUrl);

    assertIdentical(inFlight, "0");
    assertIdentical(visible, "0");
  });
});
