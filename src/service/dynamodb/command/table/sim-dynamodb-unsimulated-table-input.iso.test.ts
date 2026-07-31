import {
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
  it("refuses global secondary indexes", async () => {
    // When a table is created with a global secondary index.
    const error = await refusedCreateTable({
      ...tableInput,
      GlobalSecondaryIndexes: [{ IndexName: "byEmail" }],
    });

    // Then the index is refused rather than quietly left out.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "Global secondary indexes");
  });

  it("refuses local secondary indexes", async () => {
    // When a table is created with a local secondary index.
    const error = await refusedCreateTable({
      ...tableInput,
      LocalSecondaryIndexes: [{ IndexName: "byCreatedAt" }],
    });

    // Then the index is refused rather than quietly left out.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "Local secondary indexes");
  });

  it("refuses tags", async () => {
    // When a table is created with tags.
    const error = await refusedCreateTable({
      ...tableInput,
      Tags: [{ Key: "team", Value: "platform" }],
    });

    // Then the tags are refused rather than dropped.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "Table tags");
  });

  it("refuses a stream specification", async () => {
    // When a table is created with a stream.
    const error = await refusedCreateTable({
      ...tableInput,
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
    });

    // Then the stream is refused.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "DynamoDB streams");
  });

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
});
