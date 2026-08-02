import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbSecondaryIndexInput } from "./table.types.js";
import type { SimCreateTableCommandInput } from "./table.command.js";

const byPlacedAt = {
  IndexName: "byPlacedAt",
  KeySchema: [
    { AttributeName: "customerId", KeyType: "HASH" },
    { AttributeName: "placedAt", KeyType: "RANGE" },
  ],
  Projection: { ProjectionType: "KEYS_ONLY" },
} as const satisfies SimDynamoDbSecondaryIndexInput;

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
  LocalSecondaryIndexes: [byPlacedAt],
} as const satisfies SimCreateTableCommandInput;

/**
 * Create a table whose local secondary indexes a test has replaced.
 */
async function refusedIndexes(
  indexes: readonly SimDynamoDbSecondaryIndexInput[],
  overrides: Partial<SimCreateTableCommandInput> = {},
): Promise<Error> {
  const simDynamoDb = new SimAws().dynamoDb();

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.createTable({
      input: { ...ordersTable, ...overrides, LocalSecondaryIndexes: indexes },
    }),
  );
}

describe("DynamoDB CreateTable local secondary index validation", () => {
  it("refuses a partition key that is not the table's", async () => {
    // When an index is keyed on some other attribute.
    const error = await refusedIndexes([
      {
        ...byPlacedAt,
        KeySchema: [
          { AttributeName: "placedAt", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
      },
    ]);

    // Then it is refused. A local secondary index sits in the same partition as
    // the item it indexes, so it has no partition key of its own to choose.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Invalid KeySchema for index byPlacedAt: the HASH element names " +
        "placedAt, and a local secondary index shares the table's partition " +
        "key, which is customerId",
    );
  });

  it("refuses an index with no sort key", async () => {
    // When an index is declared with a partition key alone.
    const error = await refusedIndexes([
      {
        ...byPlacedAt,
        KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
      },
    ]);

    // Then it is refused. The sort key is the whole of what the index adds.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "has no RANGE element");
  });

  it("refuses a sort key that is the table's own", async () => {
    // When an index is sorted by the attribute the table is sorted by.
    const error = await refusedIndexes([
      {
        ...byPlacedAt,
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
      },
    ]);

    // Then it is refused, since the index would be the table written twice.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "the RANGE element names orderId, which is the table's own sort key",
    );
  });

  it("refuses a sort key attribute that is not scalar", async () => {
    // When the index sort key is defined as something other than S, N or B.
    const error = await refusedIndexes([byPlacedAt], {
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
        { AttributeName: "placedAt", AttributeType: "BOOL" },
      ],
    });

    // Then it is refused: a key attribute is one of the three scalar types.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "AttributeType 'BOOL'");
  });

  it("refuses a sort key attribute with no definition", async () => {
    // When the index sort key is named nowhere in AttributeDefinitions.
    const error = await refusedIndexes([byPlacedAt], {
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
      ],
    });

    // Then it is refused, naming the index that declared the attribute.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The KeySchema for index byPlacedAt names the attribute placedAt, " +
        "which has no AttributeDefinition",
    );
  });

  it("refuses a throughput on the index", async () => {
    // When an index asks for capacity of its own.
    const error = await refusedIndexes([
      {
        ...byPlacedAt,
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ]);

    // Then it is refused. A local secondary index is read and written out of
    // the table's own capacity, so there is nothing to provision for it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ProvisionedThroughput cannot be specified for index: byPlacedAt " +
        "because it is a local secondary index",
    );
  });

  it("refuses an on-demand throughput on the index", async () => {
    // When an index asks for on-demand limits of its own.
    const error = await refusedIndexes([
      { ...byPlacedAt, OnDemandThroughput: { MaxReadRequestUnits: 100 } },
    ]);

    // Then it is refused for the same reason provisioned capacity is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "OnDemandThroughput cannot be specified for index: byPlacedAt",
    );
  });

  it("refuses a warm throughput on the index", async () => {
    // When an index asks to be pre-warmed on its own.
    const error = await refusedIndexes([
      { ...byPlacedAt, WarmThroughput: { ReadUnitsPerSecond: 100 } },
    ]);

    // Then it is refused for the same reason provisioned capacity is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "WarmThroughput cannot be specified for index: byPlacedAt",
    );
  });

  it("refuses more than five indexes", async () => {
    // When a table declares six local secondary indexes.
    const error = await refusedIndexes(
      Array.from({ length: 6 }, (_unused, position) => ({
        ...byPlacedAt,
        IndexName: `byPlacedAt-${position.toString()}`,
      })),
    );

    // Then the request is refused for being over the cap.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "6 LocalSecondaryIndexes were given, and a table holds at most 5",
    );
  });

  it("refuses a name a global secondary index already has", async () => {
    // When a local secondary index takes the name of a global one.
    const error = await refusedIndexes(
      [{ ...byPlacedAt, IndexName: "byDate" }],
      {
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
          { AttributeName: "placedAt", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byDate",
            KeySchema: [{ AttributeName: "placedAt", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      },
    );

    // Then it is refused. An index is reached by name, so the two kinds share
    // one namespace and a read naming byDate would have two answers.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "names an index more than once");
  });

  it("refuses a local secondary index on a table with no sort key", async () => {
    // When the table it is declared on is keyed by a partition key alone.
    const error = await refusedIndexes([byPlacedAt], {
      KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "placedAt", AttributeType: "S" },
      ],
    });

    // Then the whole request is refused. Such a table holds one item per
    // partition key, so there is no collection for a second sort key to
    // reorder.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Table KeySchema does not have a range key",
    );
  });

  it("refuses an index name real DynamoDB would refuse", async () => {
    // When an index is named with characters DynamoDB does not allow.
    const error = await refusedIndexes([
      { ...byPlacedAt, IndexName: "by placed at" },
    ]);

    // Then it is refused by the same rule a table name is held to.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "IndexName 'by placed at' is invalid");
  });

  it("refuses an INCLUDE projection naming no attributes", async () => {
    // When an index includes nothing beyond its keys.
    const error = await refusedIndexes([
      { ...byPlacedAt, Projection: { ProjectionType: "INCLUDE" } },
    ]);

    // Then it is refused, the same way a global secondary index would be: both
    // kinds project by the same rules.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The Projection of index byPlacedAt is INCLUDE and names no " +
        "NonKeyAttributes",
    );
  });
});
