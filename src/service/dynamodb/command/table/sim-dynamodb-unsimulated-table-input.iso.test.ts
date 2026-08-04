import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimCreateTableCommandInput } from "./table.command.js";

const tableInput = {
  TableName: "FoobarTable",
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
} as const satisfies SimCreateTableCommandInput;

/**
 * A table carrying one index, for the settings an index has of its own.
 */
const indexedTableInput = {
  ...tableInput,
  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "status", AttributeType: "S" },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: "byStatus",
      KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
      Projection: { ProjectionType: "KEYS_ONLY" },
    },
  ],
} as const satisfies SimCreateTableCommandInput;

/**
 * Create a table asking for something the simulation does not model.
 */
async function refusedCreateTable(
  input: SimCreateTableCommandInput,
): Promise<Error> {
  const simDynamoDb = new SimAws().dynamoDb();

  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.createTable({ input }),
  );
}

describe("DynamoDB CreateTableCommand unsimulated input", () => {
  it("refuses an encryption specification", async () => {
    // When a table is created with encryption at rest.
    const error = await refusedCreateTable({
      ...tableInput,
      SSESpecification: { Enabled: true, SSEType: "KMS" },
    });

    // Then the encryption is refused.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "Table encryption at rest");
  });

  it("refuses a resource policy", async () => {
    // When a table is created with a resource policy on it.
    const error = await refusedCreateTable({
      ...tableInput,
      ResourcePolicy: JSON.stringify({ Version: "2012-10-17", Statement: [] }),
    });

    // Then the policy is refused rather than leaving the table open.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "A table ResourcePolicy");
  });

  it("refuses on-demand throughput maximums", async () => {
    // When a table is created with on-demand throughput limits.
    const error = await refusedCreateTable({
      ...tableInput,
      OnDemandThroughput: { MaxReadRequestUnits: 100 },
    });

    // Then the limits are refused.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "OnDemandThroughput maximums");
  });

  it("creates a table for input that asks for none of it", async () => {
    // Given a simulated DynamoDB.
    const simAws = new SimAws();

    // When a table is created with empty lists and everything switched off,
    // which describes the table this simulation already makes.
    const creation = await simAws.dynamoDb().createTable({
      input: {
        ...tableInput,
        GlobalSecondaryIndexes: [],
        LocalSecondaryIndexes: [],
        Tags: [],
        StreamSpecification: { StreamEnabled: false },
        SSESpecification: { Enabled: false },
      },
    });

    // Then nothing is refused and the table is created.
    assertIdentical(creation.TableDescription?.TableName, "FoobarTable");

    await simAws.backgroundTasksComplete();
  });

  it("refuses warm throughput", async () => {
    // When a table is created pre-warmed for a level of traffic.
    const error = await refusedCreateTable({
      ...tableInput,
      WarmThroughput: { ReadUnitsPerSecond: 12_000 },
    });

    // Then the warm throughput is refused.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "WarmThroughput");
  });

  it("refuses on-demand throughput maximums on an index", async () => {
    // When an index is created with on-demand throughput limits of its own.
    const error = await refusedCreateTable({
      ...indexedTableInput,
      GlobalSecondaryIndexes: [
        {
          ...indexedTableInput.GlobalSecondaryIndexes[0],
          OnDemandThroughput: { MaxReadRequestUnits: 100 },
        },
      ],
    });

    // Then the limits are refused, naming the index carrying them.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(
      error.message,
      "OnDemandThroughput maximums are not simulated, so CreateTable refuses " +
        "them on index byStatus",
    );
  });

  it("refuses warm throughput on an index", async () => {
    // When an index with no name yet is created pre-warmed for traffic.
    const error = await refusedCreateTable({
      ...indexedTableInput,
      GlobalSecondaryIndexes: [
        {
          ...indexedTableInput.GlobalSecondaryIndexes[0],
          IndexName: undefined,
          WarmThroughput: { ReadUnitsPerSecond: 12_000 },
        },
      ],
    });

    // Then the warm throughput is refused, naming the entry by its position.
    // Unsimulated input is refused before any name is read, so the position is
    // what an unnamed index can be pointed at by.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(
      error.message,
      "refuses it on GlobalSecondaryIndexes entry 1",
    );
  });
});
