import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";

function throwing(): never {
  throw new Error("Projector could not handle the batch");
}

describe("sim Lambda DynamoDB stream event source mapping failures", () => {
  it("settles rather than spinning while a failed batch waits to be tried again", async () => {
    // Given a stream mapped to a function that cannot handle what it is given.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
    });

    // When a change is written and the handler throws on it.
    await writeOrder(simAws, tableName, "order-1");

    // Then the simulation settles: the batch is waiting on the clock rather
    // than on anything still running.
    await simAws.backgroundTasksComplete();

    assertArrayLength(events, 1);
  });

  it("gives up on a batch the function never handles rather than retrying forever", async () => {
    // Given a stream mapped to a function that always throws.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: throwing,
    });

    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();

    // When an hour of simulated time passes.
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the batch was delivered again five times, after 1, 2, 4, 8 and 16
    // seconds, and then given up on, rather than leaving the clock with work
    // falling due forever.
    assertArrayLength(events, 6);
  });
});

/**
 * Write one order to the table, which is one record on its stream.
 */
async function writeOrder(
  simAws: SimAws,
  tableName: string,
  orderId: string,
): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: tableName,
      Item: { orderId: { S: orderId } },
    }),
  );
}
