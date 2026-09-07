import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";

/** How long the handler waits on the clock before it works. */
const handlerDelayMilliseconds = 5;

describe("Settling a simulated DynamoDB stream delivery", () => {
  it("waits for a handler that waits on the clock", async () => {
    // Given a table's stream mapped to a function that waits on a timer before
    // it works
    const projected: string[] = [];
    const { simAws, tableName } = await simAwsWithStreamEventSource({
      handlerResult: async (): Promise<undefined> => {
        await new Promise((resolve) => {
          setTimeout(resolve, handlerDelayMilliseconds);
        });
        projected.push("projected");

        return undefined;
      },
    });

    // When an item is written and the simulation is asked to settle once
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, total: { N: "42" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler has finished, rather than being left part way through
    // for a later drain to catch
    assertArrayLength(projected, 1);
  });
});
