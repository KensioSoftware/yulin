import {
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertArrayLength,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

/**
 * An intercepted document client, and the table its Commands work on.
 *
 * The table is created through the ordinary CreateTable Command, sent through
 * the same document client: a document client forwards a Command it has no
 * document form of, so a test needs only the one client.
 */
async function interceptedDocuments(
  simSdk: SimSdk,
): Promise<DynamoDBDocumentClient> {
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "eu-west-2" }),
  );
  simSdk.intercept(documents);

  await documents.send(
    new CreateTableCommand({
      TableName: "OrdersTable",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  return documents;
}

describe("simulated DynamoDB document client", () => {
  it("round-trips native values through a Put and a Get", async () => {
    // Given an intercepted document client.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an item is written as plain JavaScript.
    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42, paid: true, note: null },
      }),
    );

    // Then it reads back as plain JavaScript, with no AttributeValues either
    // way.
    const read = await documents.send(
      new GetCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
      }),
    );

    assertObjectEquals(read.Item, {
      orderId: "order-1",
      total: 42,
      paid: true,
      note: null,
    });
  });

  it("writes what the equivalent AttributeValue Command would have written", async () => {
    // Given an item written through the document client.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );

    // Then the ordinary GetItem Command, which converts nothing, reads it back
    // as the descriptors a table holds rather than as the native values the
    // request was written with.
    const read = await simSdk.simAws
      .region("eu-west-2")
      .dynamoDb()
      .getItem(
        new GetItemCommand({
          TableName: "OrdersTable",
          Key: { orderId: { S: "order-1" } },
        }),
      );

    assertObjectEquals(read.Item, {
      orderId: { S: "order-1" },
      total: { N: "42" },
    });
  });

  it("round-trips an Update with native expression values", async () => {
    // Given an item to update.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );

    // When it is updated with expression values written natively.
    const updated = await documents.send(
      new UpdateCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
        UpdateExpression: "SET #t = :total, shipped = :shipped",
        ExpressionAttributeNames: { "#t": "total" },
        ExpressionAttributeValues: { ":total": 99, ":shipped": true },
        ReturnValues: "ALL_NEW",
      }),
    );

    // Then the attributes come back native.
    assertObjectEquals(updated.Attributes, {
      orderId: "order-1",
      total: 99,
      shipped: true,
    });
  });

  it("round-trips a Delete answering with the item it removed", async () => {
    // Given an item to delete.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );

    // When it is deleted, asking for what was there.
    const removed = await documents.send(
      new DeleteCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
        ReturnValues: "ALL_OLD",
      }),
    );

    // Then the removed item comes back native, and the key holds nothing.
    assertObjectEquals(removed.Attributes, { orderId: "order-1", total: 42 });

    const read = await documents.send(
      new GetCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
      }),
    );
    assertUndefined(read.Item);
  });

  it("round-trips a batch write and a batch get", async () => {
    // Given an intercepted document client.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When items are written in a batch, natively.
    const written = await documents.send(
      new BatchWriteCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: "order-1", total: 42 } } },
            { PutRequest: { Item: { orderId: "order-2", total: 7 } } },
          ],
        },
      }),
    );
    assertObjectEquals(written.UnprocessedItems, {});

    // Then they read back in a batch, natively.
    const read = await documents.send(
      new BatchGetCommand({
        RequestItems: {
          OrdersTable: {
            Keys: [{ orderId: "order-1" }, { orderId: "order-2" }],
          },
        },
      }),
    );

    const items = read.Responses?.["OrdersTable"];
    assertNonNullable(items);
    assertArrayLength(items, 2);
    assertObjectEquals(items[0], { orderId: "order-1", total: 42 });
    assertObjectEquals(items[1], { orderId: "order-2", total: 7 });
    assertObjectEquals(read.UnprocessedKeys, {});
  });

  it("deletes in a batch by a native key", async () => {
    // Given an item written in a batch.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new BatchWriteCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: "order-1", total: 42 } } },
          ],
        },
      }),
    );

    // When it is deleted in a batch.
    await documents.send(
      new BatchWriteCommand({
        RequestItems: {
          OrdersTable: [{ DeleteRequest: { Key: { orderId: "order-1" } } }],
        },
      }),
    );

    // Then it has gone.
    const read = await documents.send(
      new GetCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
      }),
    );
    assertUndefined(read.Item);
  });

  it("leaves a batch get key that holds nothing out of the answer", async () => {
    // Given a table holding one of the two items asked for.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );

    // When both are read.
    const read = await documents.send(
      new BatchGetCommand({
        RequestItems: {
          OrdersTable: { Keys: [{ orderId: "order-1" }, { orderId: "gone" }] },
        },
      }),
    );

    // Then only the one that is there comes back, as BatchGetItem answers.
    const items = read.Responses?.["OrdersTable"];
    assertNonNullable(items);
    assertArrayLength(items, 1);
    assertObjectEquals(items[0], { orderId: "order-1", total: 42 });
  });
});
