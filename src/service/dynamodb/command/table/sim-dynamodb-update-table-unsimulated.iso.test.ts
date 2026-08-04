import { UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import type { UpdateTableCommandInput } from "@aws-sdk/client-dynamodb";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * Update a table with the settings given, and answer with what it refused.
 *
 * Every test here is the same shape: one setting that is not simulated, and
 * the refusal it gets. The table is the same one each time, since none of these
 * requests reaches it.
 */
async function refusedUpdate(
  input: Omit<UpdateTableCommandInput, "TableName">,
): Promise<Error> {
  const simAws = new SimAws();
  await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

  return await assertThrowsErrorAsync(async () => {
    await simAws
      .dynamoDb()
      .updateTable(new UpdateTableCommand({ TableName: "orders", ...input }));
  });
}

describe("DynamoDB UpdateTableCommand unsimulated settings", () => {
  it("refuses a customer managed encryption key", async () => {
    // Given a table, when encryption at rest is asked for, then it is refused.
    const error = await refusedUpdate({
      SSESpecification: { Enabled: true, SSEType: "KMS" },
    });

    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
  });

  it("refuses a replica in another region", async () => {
    // Given a table, when a replica is added, then it is refused, since
    // replication across regions is not simulated.
    const error = await refusedUpdate({
      ReplicaUpdates: [{ Create: { RegionName: "eu-west-2" } }],
    });

    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
  });

  it("refuses on-demand throughput maximums", async () => {
    // Given a table, when a request cap is set, then it is refused rather than
    // reported as a limit nothing applies.
    const error = await refusedUpdate({
      OnDemandThroughput: { MaxReadRequestUnits: 100 },
    });

    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
  });

  it("refuses warm throughput", async () => {
    // Given a table, when a pre-warmed capacity is asked for, then it is
    // refused.
    const error = await refusedUpdate({
      WarmThroughput: { ReadUnitsPerSecond: 12_000 },
    });

    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
  });

  it("refuses changing the capacity of an existing index", async () => {
    // Given a table, when an index capacity change is asked for, then it is
    // refused rather than moving a number nothing acts on.
    const error = await refusedUpdate({
      GlobalSecondaryIndexUpdates: [
        {
          Update: {
            IndexName: "byStatus",
            ProvisionedThroughput: {
              ReadCapacityUnits: 2,
              WriteCapacityUnits: 2,
            },
          },
        },
      ],
    });

    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
  });
});
