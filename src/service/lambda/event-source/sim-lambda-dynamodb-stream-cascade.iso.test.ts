import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSourceStream,
  simAwsWithStreamEventSource,
} from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimLambdaDynamoDbStreamEvent } from "./poll/sim-lambda-dynamodb-stream-event.js";

describe("sim Lambda DynamoDB stream event source write cascades", () => {
  it("refuses a function that writes back into its own source table", async () => {
    // Given a function whose handler writes an aggregate into the table whose
    // stream invoked it, which is a loop rather than a projection.
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
    assertStringIncludes(error.message, "Write the result to a different");
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
