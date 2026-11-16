import {
  assertNonNullable,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * Create a table carrying the tags given, as the caller given.
 */
async function createTable(
  simAws: SimAws,
  TableName: string,
  Tags: readonly { Key: string; Value: string }[],
  caller: SimAwsCaller,
): Promise<unknown> {
  return simAws.dynamoDb().createTable(
    {
      input: {
        TableName,
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
        Tags,
      },
    },
    { caller },
  );
}

describe("sim DynamoDB request tags", () => {
  it("needs dynamodb:TagResource to create a table with tags", async () => {
    // Given a caller allowed to create tables and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["dynamodb:CreateTable"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates an untagged table and a tagged one
    await createTable(simAws, "Plain", [], caller);
    const error = await assertThrowsErrorAsync(async () =>
      createTable(simAws, "Tagged", [{ Key: "team", Value: "orders" }], caller),
    );

    // Then only the tagged table is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.dynamoDb().findTable("Plain"));
    assertUndefined(simAws.dynamoDb().findTable("Tagged"));
  });

  it("lets a policy decide CreateTable on the tags it carries", async () => {
    // Given a caller allowed to create and tag tables tagged for its own team
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["dynamodb:CreateTable", "dynamodb:TagResource"],
        condition: { StringEquals: { "aws:RequestTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates a table for its own team and one for another
    await createTable(
      simAws,
      "Orders",
      [{ Key: "team", Value: "orders" }],
      caller,
    );
    const error = await assertThrowsErrorAsync(async () =>
      createTable(
        simAws,
        "Billing",
        [{ Key: "team", Value: "billing" }],
        caller,
      ),
    );

    // Then only its own team's table is made
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.dynamoDb().findTable("Orders"));
    assertUndefined(simAws.dynamoDb().findTable("Billing"));
  });

  it("gives IAM the keys TagResource and UntagResource name", async () => {
    // Given a table, and a caller allowed to tag and untag only the cost key
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make({}, simAws);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["dynamodb:TagResource", "dynamodb:UntagResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const ResourceArn = table.arn;

    // When it sets and removes the cost key, then tries the team key
    await simAws
      .dynamoDb()
      .tagResource(
        { input: { ResourceArn, Tags: [{ Key: "cost", Value: "42" }] } },
        { caller },
      );
    await simAws
      .dynamoDb()
      .untagResource({ input: { ResourceArn, TagKeys: ["cost"] } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .tagResource(
          { input: { ResourceArn, Tags: [{ Key: "team", Value: "orders" }] } },
          { caller },
        ),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
