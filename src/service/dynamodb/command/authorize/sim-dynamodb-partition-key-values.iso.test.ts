import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simDynamoDbMultiKeyTableFactory } from "../../secondary-index/sim-dynamodb-multi-key-table.factory.js";

/**
 * Query the multi-attribute index for one warehouse of the north region.
 */
async function queryWarehouse(
  simAws: SimAws,
  warehouse: string,
  arn: string,
): Promise<unknown> {
  return simAws.dynamoDb().query(
    {
      input: {
        TableName: "OrdersTable",
        IndexName: "byWarehouse",
        KeyConditionExpression: "#region = :region AND warehouse = :warehouse",
        ExpressionAttributeNames: { "#region": "region" },
        ExpressionAttributeValues: {
          ":region": { S: "north" },
          ":warehouse": { S: warehouse },
        },
      },
    },
    { caller: { kind: "arn", arn } },
  );
}

describe("DynamoDB numbered partition key condition keys", () => {
  it("scopes a query by the second attribute of a partition key", async () => {
    // Given an index keyed by region and then warehouse, and a caller allowed
    // to query warehouse w1 only.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "WarehouseRole",
        actions: ["dynamodb:Query"],
        condition: {
          "ForAllValues:StringEquals": {
            "dynamodb:FirstPartitionKeyValues": ["north"],
            "dynamodb:SecondPartitionKeyValues": ["w1"],
          },
          Null: { "dynamodb:SecondPartitionKeyValues": "false" },
        },
      },
      simAws,
    );

    // When it queries its own warehouse and then another.
    await queryWarehouse(simAws, "w1", role.Arn);
    const error = await assertThrowsErrorAsync(async () =>
      queryWarehouse(simAws, "w2", role.Arn),
    );

    // Then the second attribute's value decides, and w2 is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("supplies only the first family on a table's own key", async () => {
    // Given a caller allowed queries only when a second partition key value
    // is present.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "SecondKeyRole",
        actions: ["dynamodb:GetItem"],
        condition: { Null: { "dynamodb:SecondPartitionKeyValues": "false" } },
      },
      simAws,
    );

    // When it reads by the table's single-attribute key.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().getItem(
        {
          input: {
            TableName: "OrdersTable",
            Key: { orderId: { S: "order-1" } },
          },
        },
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // Then there is no second value to supply, and the read is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
