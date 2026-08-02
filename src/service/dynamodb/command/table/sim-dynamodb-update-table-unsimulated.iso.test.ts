import { UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB UpdateTableCommand unsimulated settings", () => {
  it("refuses the settings that are not simulated by name", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);

    // When a stream is switched on, then it is refused rather than reported.
    const stream = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          StreamSpecification: {
            StreamEnabled: true,
            StreamViewType: "NEW_IMAGE",
          },
        }),
      );
    });
    assertInstanceOf(stream, SimDynamoDbUnsupportedOperation);

    // And so is a customer managed encryption key.
    const encryption = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          SSESpecification: { Enabled: true, SSEType: "KMS" },
        }),
      );
    });
    assertInstanceOf(encryption, SimDynamoDbUnsupportedOperation);

    // And so are replicas, on-demand maximums, warm throughput and a per-index
    // capacity change.
    const replicas = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          ReplicaUpdates: [{ Create: { RegionName: "eu-west-2" } }],
        }),
      );
    });
    assertInstanceOf(replicas, SimDynamoDbUnsupportedOperation);

    const onDemand = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          OnDemandThroughput: { MaxReadRequestUnits: 100 },
        }),
      );
    });
    assertInstanceOf(onDemand, SimDynamoDbUnsupportedOperation);

    const warm = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          WarmThroughput: { ReadUnitsPerSecond: 12_000 },
        }),
      );
    });
    assertInstanceOf(warm, SimDynamoDbUnsupportedOperation);

    const indexCapacity = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
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
        }),
      );
    });
    assertInstanceOf(indexCapacity, SimDynamoDbUnsupportedOperation);
  });
});
