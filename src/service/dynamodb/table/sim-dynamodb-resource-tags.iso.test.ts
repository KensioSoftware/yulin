import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Create a table with a global secondary index, tagged for the team given.
 */
async function createTable(
  simAws: SimAws,
  tableName: string,
  team: string,
): Promise<void> {
  await simAws.dynamoDb().createTable({
    input: {
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "ByStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      Tags: [{ Key: "team", Value: team }],
    },
  });
}

describe("a sim DynamoDB table's tags in IAM", () => {
  it("lets a policy decide a request on the tags of the table", async () => {
    // Given two tables tagged for different teams, and a caller allowed to
    // read the tables tagged for its own
    const simAws = new SimAws();
    await createTable(simAws, "Orders", "orders");
    await createTable(simAws, "Invoices", "billing");
    await simAws.backgroundTasksComplete();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["dynamodb:GetItem", "dynamodb:Query"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it reads an item from its own table and queries its index
    const item = await simAws
      .dynamoDb()
      .getItem(
        { input: { TableName: "Orders", Key: { id: { S: "1" } } } },
        { caller },
      );
    const queried = await simAws.dynamoDb().query(
      {
        input: {
          TableName: "Orders",
          IndexName: "ByStatus",
          KeyConditionExpression: "#s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": { S: "open" } },
        },
      },
      { caller },
    );

    // Then both are allowed, the index on its table's tags, and the other
    // team's table is refused
    assertNonNullable(item);
    assertNonNullable(queried.Items);
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .getItem(
          { input: { TableName: "Invoices", Key: { id: { S: "1" } } } },
          { caller },
        ),
    );
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
