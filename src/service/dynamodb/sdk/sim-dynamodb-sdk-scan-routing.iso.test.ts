import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand as DocumentScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

/**
 * An intercepted client with two items written to a table.
 */
async function tableClient(simSdk: SimSdk): Promise<DynamoDBClient> {
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

  await Promise.all(
    ["order-1", "order-2"].map(async (orderId) =>
      client.send(
        new PutItemCommand({
          TableName: "CollectionTable",
          Item: { customerId: { S: "c-1" }, orderId: { S: orderId } },
        }),
      ),
    ),
  );

  return client;
}

describe("simulated DynamoDB Scan SDK Command routing", () => {
  it("round-trips a Scan through an intercepted client", async () => {
    // Given an intercepted client with items written to a table.
    using simSdk = new SimSdk();
    const client = await tableClient(simSdk);

    // When the table is scanned through the client.
    const output = await client.send(
      new ScanCommand({ TableName: "CollectionTable" }),
    );

    // Then the page comes back the way the SDK's own types expect it.
    assertArrayLength(output.Items ?? [], 2);
    assertIdentical(output.Count, 2);
    assertIdentical(output.ScannedCount, 2);
  });

  it("routes the document client's Scan, which shares its name", async () => {
    // Given an intercepted document client. It is the document client that is
    // intercepted, since it has a send of its own.
    using simSdk = new SimSdk();
    const client = await tableClient(simSdk);
    const documentClient = DynamoDBDocumentClient.from(client);
    simSdk.intercept(documentClient);

    // When a document Scan is sent through it.
    const output = await documentClient.send(
      new DocumentScanCommand({ TableName: "CollectionTable" }),
    );

    // Then it reads the same table, answering with native values rather than
    // AttributeValues, even though @aws-sdk/lib-dynamodb names its Command the
    // same as @aws-sdk/client-dynamodb does.
    assertArrayLength(output.Items ?? [], 2);
    assertIdentical(output.Items?.[0]?.["customerId"], "c-1");
  });
});
