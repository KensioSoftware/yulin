import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";

/**
 * A stream mapping delivers one record at a time here, so a record that follows
 * a failing one is a record that has to wait for it.
 */
const oneRecordAtATime = 1;

describe("sim Lambda DynamoDB stream event source mapping blocking", () => {
  it("holds back the record behind a failing batch until that batch is through", async () => {
    // Given a mapping delivering one record at a time to a function that
    // throws on the first order and handles the second.
    const failed: string[] = [];
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      batchSize: oneRecordAtATime,
      handlerResult: (event: SimLambdaDynamoDbStreamEvent): undefined => {
        if (orderIdIn(event) === "order-1" && failed.length < 2) {
          failed.push("order-1");

          throw new Error("Projector could not handle order-1");
        }

        return undefined;
      },
    });

    // When both orders are written.
    await writeOrder(simAws, tableName, "order-1");
    await writeOrder(simAws, tableName, "order-2");
    await simAws.backgroundTasksComplete();

    // Then only the failing one has been delivered: the second is behind it on
    // the shard.
    assertArrayLength(events, 1);
    assertIdentical(orderIdIn(events[0]), "order-1");

    // And it is delivered once the failing batch gets through.
    await simAws.clock().advanceBy({ seconds: 5 });

    assertIdentical(orderIdIn(events.at(-1)), "order-2");
  });

  it("discards a batch that runs out of attempts and carries on with the stream", async () => {
    // Given a mapping delivering one record at a time, whose function can
    // never handle the first order.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      batchSize: oneRecordAtATime,
      handlerResult: (event: SimLambdaDynamoDbStreamEvent): undefined => {
        if (orderIdIn(event) === "order-1") {
          throw new Error("Projector could not handle order-1");
        }

        return undefined;
      },
    });

    await writeOrder(simAws, tableName, "order-1");
    await writeOrder(simAws, tableName, "order-2");
    await simAws.backgroundTasksComplete();

    // When the first order has had every attempt it gets.
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then it was given up on and the record behind it was delivered.
    assertIdentical(orderIdIn(events.at(-1)), "order-2");
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

function orderIdIn(
  event: SimLambdaDynamoDbStreamEvent | undefined,
): string | undefined {
  return event?.Records[0]?.dynamodb.Keys?.["orderId"]?.S;
}
