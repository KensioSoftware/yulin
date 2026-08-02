import type { CreateTableCommandInput } from "@aws-sdk/client-dynamodb";
import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";

const ordersTable = {
  TableName: "OrdersTable",
  KeySchema: [
    { AttributeName: "customerId", KeyType: "HASH" },
    { AttributeName: "orderId", KeyType: "RANGE" },
  ],
  AttributeDefinitions: [
    { AttributeName: "customerId", AttributeType: "S" },
    { AttributeName: "orderId", AttributeType: "S" },
    { AttributeName: "placedAt", AttributeType: "S" },
  ],
  BillingMode: "PAY_PER_REQUEST",
  LocalSecondaryIndexes: [
    {
      IndexName: "byPlacedAt",
      KeySchema: [
        { AttributeName: "customerId", KeyType: "HASH" },
        { AttributeName: "placedAt", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "KEYS_ONLY" },
    },
  ],
} satisfies CreateTableCommandInput;

/**
 * The table keyed the way the orders table is, with no index on it at all.
 */
const unindexedTable = {
  TableName: ordersTable.TableName,
  KeySchema: ordersTable.KeySchema,
  AttributeDefinitions: ordersTable.AttributeDefinitions.slice(0, 2),
  BillingMode: ordersTable.BillingMode,
} satisfies CreateTableCommandInput;

describe("DynamoDB CreateTable with local secondary indexes", () => {
  it("reports the index it was declared with", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with a local secondary index.
    const creation = await simAws
      .dynamoDb()
      .createTable(new CreateTableCommand(ordersTable));

    // Then the description reports it the way DynamoDB does.
    const index = creation.TableDescription?.LocalSecondaryIndexes?.[0];
    assertDefined(index, "the created table's local secondary index");
    assertIdentical(index.IndexName, "byPlacedAt");
    assertIdentical(index.Projection?.ProjectionType, "KEYS_ONLY");
    assertArrayLength(index.KeySchema ?? [], 2);
    assertIdentical(index.KeySchema?.[0]?.AttributeName, "customerId");
    assertIdentical(index.KeySchema[1]?.AttributeName, "placedAt");
    assertIdentical(index.ItemCount, 0);
    assertIdentical(index.IndexSizeBytes, 0);

    await simAws.backgroundTasksComplete();
  });

  it("names the index under the table's own ARN", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with a local secondary index.
    const creation = await simAws
      .dynamoDb()
      .createTable({ input: ordersTable });

    // Then the index ARN is the table's with the index named under it, which is
    // the resource an IAM policy naming one index is written against.
    const index = creation.TableDescription?.LocalSecondaryIndexes?.[0];
    assertIdentical(
      index?.IndexArn,
      `${creation.TableDescription?.TableArn ?? ""}/index/byPlacedAt`,
    );

    await simAws.backgroundTasksComplete();
  });

  it("leaves the indexes out of a table that declared none", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created without any local secondary index.
    const creation = await simAws.dynamoDb().createTable({
      input: { ...unindexedTable, LocalSecondaryIndexes: [] },
    });

    // Then the description leaves the field out altogether rather than
    // reporting an empty list, which is what real DynamoDB does.
    assertUndefined(creation.TableDescription?.LocalSecondaryIndexes);

    await simAws.backgroundTasksComplete();
  });

  it("describes the indexes off the table afterwards", async () => {
    // Given a table created with a local secondary index.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable({ input: ordersTable });
    await simAws.backgroundTasksComplete();

    // When the table is described.
    const description = await simAws
      .dynamoDb()
      .describeTable({ input: { TableName: "OrdersTable" } });

    // Then the index is reported the same way it was on creation.
    assertIdentical(
      description.Table?.LocalSecondaryIndexes?.[0]?.IndexName,
      "byPlacedAt",
    );
  });

  it("takes both kinds of index on one table", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table declares an index of each kind.
    const creation = await simAws.dynamoDb().createTable({
      input: {
        ...ordersTable,
        AttributeDefinitions: [
          ...ordersTable.AttributeDefinitions,
          { AttributeName: "status", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      },
    });

    // Then both are reported, each under its own field.
    assertArrayLength(
      creation.TableDescription?.LocalSecondaryIndexes ?? [],
      1,
    );
    assertArrayLength(
      creation.TableDescription?.GlobalSecondaryIndexes ?? [],
      1,
    );

    await simAws.backgroundTasksComplete();
  });

  it("takes the five indexes a table holds", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();
    const sortKeys = ["placedAt", "shippedAt", "paidAt", "packedAt", "sentAt"];

    // When a table declares the most local secondary indexes it can.
    const creation = await simAws.dynamoDb().createTable({
      input: {
        ...unindexedTable,
        AttributeDefinitions: [
          ...unindexedTable.AttributeDefinitions,
          ...sortKeys.map((name) => ({
            AttributeName: name,
            AttributeType: "S",
          })),
        ],
        LocalSecondaryIndexes: sortKeys.map((name) => ({
          IndexName: `by-${name}`,
          KeySchema: [
            { AttributeName: "customerId", KeyType: "HASH" },
            { AttributeName: name, KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "KEYS_ONLY" },
        })),
      },
    });

    // Then all five are created, each giving the collection a sort key of its
    // own over the same items.
    assertArrayLength(
      creation.TableDescription?.LocalSecondaryIndexes ?? [],
      5,
    );

    await simAws.backgroundTasksComplete();
  });
});
