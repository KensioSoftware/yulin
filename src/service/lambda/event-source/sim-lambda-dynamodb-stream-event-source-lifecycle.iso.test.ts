import { PutItemCommand, UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { DeleteEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";

/**
 * A stream mapping delivers one record at a time here, so a record that follows
 * a failing one is a record that has to wait for it.
 */
const oneRecordAtATime = 1;

describe("sim Lambda DynamoDB stream event source mapping lifecycle", () => {
  it("stops delivering once the mapping is deleted", async () => {
    // Given a stream mapped to a function.
    const { simAws, tableName, uuid, events } =
      await simAwsWithStreamEventSource();

    // When the mapping is deleted and the table changes afterwards.
    await simAws
      .lambda()
      .deleteEventSourceMapping(
        new DeleteEventSourceMappingCommand({ UUID: uuid }),
      );
    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();

    // Then nothing was delivered: the mapping stopped watching the stream.
    assertArrayEmpty(events);
  });

  it("stops reading once the table's stream is switched off", async () => {
    // Given a mapping whose function threw on the batch it was given.
    const failures: string[] = [];
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      batchSize: oneRecordAtATime,
      handlerResult: (): undefined => {
        if (failures.length === 0) {
          failures.push("order-1");

          throw new Error("Projector could not handle order-1");
        }

        return undefined;
      },
    });

    await writeOrder(simAws, tableName, "order-1");
    await simAws.backgroundTasksComplete();

    // When the table's stream is switched off before the batch is tried again.
    await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: tableName,
        StreamSpecification: { StreamEnabled: false },
      }),
    );
    await simAws.clock().advanceBy({ seconds: 5 });

    // Then the batch was delivered again and read from a shard that is
    // finished with, so the mapping has nothing left to come back for.
    assertArrayLength(events, 2);
    assertIdentical(orderIdIn(events[1]), "order-1");
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
