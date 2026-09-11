import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSourceStream,
  simAwsWithStreamEventSource,
} from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.types.js";
import { simLambdaStreamCascadeLimit } from "./stream/sim-lambda-stream-cascade-guard.js";

/**
 * The order ids a batch carries.
 */
function orderIds(event: SimLambdaDynamoDbStreamEvent): readonly string[] {
  return event.Records.map(
    (record) => record.dynamodb.Keys?.["orderId"]?.S ?? "",
  );
}

describe("sim Lambda DynamoDB stream event source write cascades", () => {
  it("refuses a function that writes back into its own source table on every delivery", async () => {
    // Given a function whose handler writes an aggregate into the table whose
    // stream invoked it, and does it again for the aggregate's own record.
    const simAws = new SimAws();
    const { tableName } = await simAwsWithStreamEventSource({
      simAws,
      handlerResult: (event: SimLambdaDynamoDbStreamEvent): Promise<unknown> =>
        simAws.dynamoDb().putItem(
          new PutItemCommand({
            TableName: "orders",
            Item: {
              orderId: { S: `total-${String(event.Records.length)}` },
            },
          }),
        ),
    });

    // When a change is written to the table.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );

    // Then the simulation refuses rather than going round forever, naming the
    // function, the stream and the table.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.backgroundTasksComplete();
    });

    assertStringIncludes(error.message, "order-projector");
    assertStringIncludes(error.message, "the table orders");
    assertStringIncludes(error.message, "own stream");
    assertStringIncludes(
      error.message,
      `${String(simLambdaStreamCascadeLimit)} deliveries in a row`,
    );
    assertStringIncludes(error.message, "Write the result to a different");
  });

  it("delivers a write back into the source table and settles when the next delivery writes nothing", async () => {
    // Given a function whose handler writes a total for an order into the
    // table that invoked it, and leaves a total it is given alone.
    const simAws = new SimAws();
    const { tableName, events } = await simAwsWithStreamEventSource({
      simAws,
      handlerResult: async (
        event: SimLambdaDynamoDbStreamEvent,
      ): Promise<void> => {
        const untotalled = orderIds(event).filter(
          (id) => !id.startsWith("total-"),
        );

        await Promise.all(
          untotalled.map(async (orderId) => {
            await simAws.dynamoDb().putItem(
              new PutItemCommand({
                TableName: "orders",
                Item: { orderId: { S: `total-${orderId}` } },
              }),
            );
          }),
        );
      },
    });

    // When an order is written to the table.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler's own write was delivered back to it, that delivery
    // wrote nothing, and the simulation settled.
    assertArrayLength(events, 2);
    assertArrayEquals(orderIds(events[1]), ["total-order-1"]);

    const orders = await simAws
      .dynamoDb()
      .scan({ input: { TableName: tableName } });

    assertArrayLength(orders.Items ?? [], 2);
  });

  it("allows a function that writes into a second table", async () => {
    // Given a function whose handler writes its projection somewhere else.
    const simAws = new SimAws();
    const projected = await makeSourceStream(simAws, {
      tableName: "order-totals",
    });
    const { tableName } = await simAwsWithStreamEventSource({
      simAws,
      handlerResult: (event: SimLambdaDynamoDbStreamEvent): Promise<unknown> =>
        simAws.dynamoDb().putItem(
          new PutItemCommand({
            TableName: projected.tableName,
            Item: {
              orderId: { S: `total-${String(event.Records.length)}` },
            },
          }),
        ),
    });

    // When a change is written to the source table.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the projection was written, and nothing refused it.
    const totals = await simAws
      .dynamoDb()
      .scan({ input: { TableName: projected.tableName } });

    assertStringIncludes(JSON.stringify(totals.Items), "total-1");
  });
});
