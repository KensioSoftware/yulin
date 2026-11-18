import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  deployWithOrder,
  storedStatus,
  updateOrdersTable,
} from "./sim-cfn-dynamodb-table-update.test-support.js";

/**
 * The properties of an orders table indexed by status, billed as the test
 * asks, with the capacity given wherever billing is provisioned.
 */
function indexedOrders(
  billingMode: string,
  units = 5,
): SimCfnTemplateValueRecord {
  const capacity =
    billingMode === "PROVISIONED"
      ? {
          ProvisionedThroughput: {
            ReadCapacityUnits: units,
            WriteCapacityUnits: units,
          },
        }
      : {};

  return {
    BillingMode: billingMode,
    ...capacity,
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "byStatus",
        KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
        ...capacity,
      },
    ],
  };
}

/**
 * The capacity the status index reports.
 */
async function indexCapacity(simAws: SimAws) {
  const described = await simAws
    .dynamoDb()
    .describeTable(new DescribeTableCommand({ TableName: "orders" }));

  return described.Table?.GlobalSecondaryIndexes?.[0]?.ProvisionedThroughput;
}

describe("DynamoDB CloudFormation Table update index capacity", () => {
  it("gives a kept index the capacity the template now names", async () => {
    // Given a provisioned table deployed with an index.
    const simAws = new SimAws();
    await deployWithOrder(simAws, indexedOrders("PROVISIONED"));

    // When the stack is updated with more capacity for both.
    await updateOrdersTable(simAws, indexedOrders("PROVISIONED", 12));

    // Then the index reports its new capacity, and the table kept its order.
    assertObjectEquals(await indexCapacity(simAws), {
      ReadCapacityUnits: 12,
      WriteCapacityUnits: 12,
      NumberOfDecreasesToday: 0,
    });
    assertIdentical(await storedStatus(simAws), "open");
  });

  it("provisions a kept index when the table switches to provisioned", async () => {
    // Given an on-demand table deployed with an index.
    const simAws = new SimAws();
    await deployWithOrder(simAws, indexedOrders("PAY_PER_REQUEST"));

    // When the stack is updated to provisioned billing.
    await updateOrdersTable(simAws, indexedOrders("PROVISIONED", 7));

    // Then the index has the capacity the template names.
    const capacity = await indexCapacity(simAws);
    assertIdentical(capacity?.ReadCapacityUnits, 7);
  });

  it("takes a kept index's capacity away when the table goes on-demand", async () => {
    // Given a provisioned table deployed with an index.
    const simAws = new SimAws();
    await deployWithOrder(simAws, indexedOrders("PROVISIONED"));

    // When the stack is updated to on-demand billing.
    await updateOrdersTable(simAws, indexedOrders("PAY_PER_REQUEST"));

    // Then the index has no capacity either.
    const capacity = await indexCapacity(simAws);
    assertIdentical(capacity?.ReadCapacityUnits, 0);
  });

  it("drops an index before switching the table to provisioned", async () => {
    // Given an on-demand table deployed with an index.
    const simAws = new SimAws();
    await deployWithOrder(simAws, indexedOrders("PAY_PER_REQUEST"));

    // When the stack is updated to provisioned billing without the index.
    await updateOrdersTable(simAws, {
      BillingMode: "PROVISIONED",
      ProvisionedThroughput: { ReadCapacityUnits: 4, WriteCapacityUnits: 4 },
    });

    // Then the table is provisioned, has no index, and kept its order.
    const described = await simAws
      .dynamoDb()
      .describeTable(new DescribeTableCommand({ TableName: "orders" }));
    const table = described.Table;
    assertNonNullable(table);
    assertIdentical(table.ProvisionedThroughput?.ReadCapacityUnits, 4);
    assertUndefined(table.GlobalSecondaryIndexes);
    assertIdentical(await storedStatus(simAws), "open");
  });
});
