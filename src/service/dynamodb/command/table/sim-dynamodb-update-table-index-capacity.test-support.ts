import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimUpdateTableCommandInput } from "./table.command.js";
import type {
  SimDynamoDbGlobalSecondaryIndexDescription,
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
} from "./table.types.js";

/** The capacity the table and its index start with when provisioned. */
export const capacity = { ReadCapacityUnits: 5, WriteCapacityUnits: 5 };

/**
 * An orders table with an index on status, billed the way the test asks.
 */
export async function ordersByStatus(billingMode: string): Promise<SimAws> {
  const simAws = new SimAws();
  const throughput =
    billingMode === "PROVISIONED" ? { ProvisionedThroughput: capacity } : {};

  await simAws.dynamoDb().createTable({
    input: {
      TableName: "orders",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "orderId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      BillingMode: billingMode,
      ...throughput,
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
          ...throughput,
        },
      ],
    },
  });
  await simAws.backgroundTasksComplete();

  return simAws;
}

/**
 * Update the orders table with the settings given.
 */
export async function updateOrders(
  simAws: SimAws,
  input: Omit<SimUpdateTableCommandInput, "TableName">,
): Promise<void> {
  await simAws
    .dynamoDb()
    .updateTable({ input: { TableName: "orders", ...input } });
}

/**
 * The `Update` entry that gives the status index new capacity.
 */
export function byStatusCapacity(
  units: number,
): SimDynamoDbGlobalSecondaryIndexUpdateInput {
  return {
    Update: {
      IndexName: "byStatus",
      ProvisionedThroughput: {
        ReadCapacityUnits: units,
        WriteCapacityUnits: units,
      },
    },
  };
}

/**
 * The status index as DescribeTable reports it.
 */
export async function describedIndex(
  simAws: SimAws,
): Promise<SimDynamoDbGlobalSecondaryIndexDescription> {
  const described = await simAws
    .dynamoDb()
    .describeTable({ input: { TableName: "orders" } });
  const index = described.Table?.GlobalSecondaryIndexes?.[0];
  assertNonNullable(index);

  return index;
}
