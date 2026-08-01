import {
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCreateTableCommandInput } from "./table.command.js";
import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbSecondaryIndexInput,
} from "./table.types.js";

/**
 * What a test asks for beyond the index itself.
 *
 * `AttributeDefinitions` names exactly the key attributes, index keys included,
 * so an index keyed on a sort key of its own needs that attribute defined and
 * one keyed on a partition key alone must not carry it.
 */
type SimDynamoDbIndexedTableInput = Pick<
  SimCreateTableCommandInput,
  "AttributeDefinitions" | "BillingMode" | "ProvisionedThroughput"
>;

const onDemand: SimDynamoDbIndexedTableInput = {
  BillingMode: "PAY_PER_REQUEST",
  AttributeDefinitions: [
    { AttributeName: "pk", AttributeType: "S" },
    { AttributeName: "status", AttributeType: "S" },
  ],
};

/**
 * Create a table carrying one global secondary index, and read the index back.
 */
async function createdIndex(
  simAws: SimAws,
  index: SimDynamoDbSecondaryIndexInput,
  table: SimDynamoDbIndexedTableInput = onDemand,
): Promise<SimDynamoDbGlobalSecondaryIndexDescription> {
  const creation = await simAws.dynamoDb().createTable({
    input: {
      TableName: "FoobarTable",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      ...table,
      GlobalSecondaryIndexes: [index],
    },
  });

  const described = creation.TableDescription?.GlobalSecondaryIndexes?.[0];
  assertDefined(described, "the created index");

  return described;
}

describe("DynamoDB CreateTableCommand global secondary indexes", () => {
  it("reports an index the request declared", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with an index on a partition key of its own.
    const index = await createdIndex(simAws, {
      IndexName: "byStatus",
      KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
      Projection: { ProjectionType: "KEYS_ONLY" },
    });

    // Then the index is reported as the request described it.
    const [hashKey] = index.KeySchema ?? [];
    assertDefined(hashKey, "the index HASH key element");
    assertIdentical(index.IndexName, "byStatus");
    assertIdentical(hashKey.AttributeName, "status");
    assertIdentical(hashKey.KeyType, "HASH");
    assertIdentical(index.Projection?.ProjectionType, "KEYS_ONLY");
    assertIdentical(index.ItemCount, 0);
    assertIdentical(index.IndexSizeBytes, 0);

    await simAws.backgroundTasksComplete();
  });

  it("gives an index an ARN under its table", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with an index.
    const index = await createdIndex(simAws, {
      IndexName: "byStatus",
      KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    });

    // Then the index ARN names the index under the table ARN.
    assertIdentical(
      index.IndexArn,
      `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:table/FoobarTable/index/byStatus`,
    );

    await simAws.backgroundTasksComplete();
  });

  it("takes an index with a sort key of its own", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with an index keyed on two attributes.
    const index = await createdIndex(
      simAws,
      {
        IndexName: "byStatusUpdatedAt",
        KeySchema: [
          { AttributeName: "status", KeyType: "HASH" },
          { AttributeName: "updatedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        ...onDemand,
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
          { AttributeName: "updatedAt", AttributeType: "N" },
        ],
      },
    );

    // Then both key elements are reported, in the order they were given.
    const elements = index.KeySchema ?? [];
    assertArrayLength(elements, 2);
    assertIdentical(elements[1].AttributeName, "updatedAt");
    assertIdentical(elements[1].KeyType, "RANGE");

    await simAws.backgroundTasksComplete();
  });

  it("reports the attributes an INCLUDE projection adds", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with an index projecting named attributes.
    const index = await createdIndex(simAws, {
      IndexName: "byStatus",
      KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
      Projection: {
        ProjectionType: "INCLUDE",
        NonKeyAttributes: ["title", "owner"],
      },
    });

    // Then the projection is reported with the attributes it names.
    const included = index.Projection?.NonKeyAttributes ?? [];
    assertIdentical(index.Projection?.ProjectionType, "INCLUDE");
    assertIdentical(included[0], "title");
    assertIdentical(included[1], "owner");

    await simAws.backgroundTasksComplete();
  });

  it("leaves NonKeyAttributes out of a projection that names none", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with an index projecting the whole item.
    const index = await createdIndex(simAws, {
      IndexName: "byStatus",
      KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" },
    });

    // Then the projection reports no NonKeyAttributes rather than an empty
    // list, since ALL names no attributes to add.
    assertUndefined(index.Projection?.NonKeyAttributes);

    await simAws.backgroundTasksComplete();
  });

  it("reports the capacity a provisioned index was created with", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a provisioned table is created with a provisioned index.
    const index = await createdIndex(
      simAws,
      {
        IndexName: "byStatus",
        KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
        Projection: { ProjectionType: "KEYS_ONLY" },
        ProvisionedThroughput: {
          ReadCapacityUnits: 7,
          WriteCapacityUnits: 2,
        },
      },
      {
        AttributeDefinitions: onDemand.AttributeDefinitions,
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 3,
        },
      },
    );

    // Then the index reports its own capacity rather than the table's.
    const throughput = index.ProvisionedThroughput;
    assertDefined(throughput, "the index ProvisionedThroughput");
    assertIdentical(throughput.ReadCapacityUnits, 7);
    assertIdentical(throughput.WriteCapacityUnits, 2);

    await simAws.backgroundTasksComplete();
  });

  it("moves an index from CREATING to ACTIVE with its table", async () => {
    // Given a table created with an index, through the SDK Command.
    const simAws = new SimAws();
    const dynamoDb = simAws.dynamoDb();
    const creation = await dynamoDb.createTable(
      new CreateTableCommand({
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "status", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        GlobalSecondaryIndexes: [
          {
            IndexName: "byStatus",
            KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
            Projection: { ProjectionType: "KEYS_ONLY" },
          },
        ],
      }),
    );

    // Then the index is CREATING while the table is.
    assertIdentical(
      creation.TableDescription?.GlobalSecondaryIndexes?.[0]?.IndexStatus,
      "CREATING",
    );

    // When the scheduled activation has run.
    await simAws.backgroundTasksComplete();
    const described = await dynamoDb.describeTable(
      new DescribeTableCommand({ TableName: "FoobarTable" }),
    );

    // Then DescribeTable reports the index as ACTIVE.
    assertIdentical(
      described.Table?.GlobalSecondaryIndexes?.[0]?.IndexStatus,
      "ACTIVE",
    );
  });

  it("leaves the indexes out of a table that declared none", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with no index at all.
    const creation = await simAws.dynamoDb().createTable({
      input: {
        TableName: "FoobarTable",
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      },
    });

    // Then the description leaves GlobalSecondaryIndexes out rather than
    // reporting an empty list, which is what real DynamoDB does.
    assertUndefined(creation.TableDescription?.GlobalSecondaryIndexes);

    await simAws.backgroundTasksComplete();
  });
});
