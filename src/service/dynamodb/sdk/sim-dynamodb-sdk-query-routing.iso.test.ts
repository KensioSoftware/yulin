import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("simulated DynamoDB Query SDK Command routing", () => {
  it("round-trips a Query through an intercepted client", async () => {
    // Given an intercepted client with a collection written to a table.
    using simSdk = new SimSdk();
    const client = new DynamoDBClient({ region: "eu-west-2" });
    simSdk.intercept(client);

    await client.send(
      new CreateTableCommand({
        TableName: "CollectionTable",
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    await client.send(
      new PutItemCommand({
        TableName: "CollectionTable",
        Item: { customerId: { S: "c-1" }, orderId: { S: "order-1" } },
      }),
    );

    // When the collection is queried through the client.
    const output = await client.send(
      new QueryCommand({
        TableName: "CollectionTable",
        KeyConditionExpression: "customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-1" } },
      }),
    );

    // Then the page comes back the way the SDK's own types expect it.
    assertArrayLength(output.Items ?? [], 1);
    assertIdentical(output.Items?.at(0)?.["orderId"]?.S, "order-1");
    assertIdentical(output.Count, 1);
    assertIdentical(output.ScannedCount, 1);
  });
});
