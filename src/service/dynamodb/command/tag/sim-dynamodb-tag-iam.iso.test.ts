import {
  ListTagsOfResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

describe("DynamoDB tag command IAM authorization", () => {
  it("allows a Role its policy permits to tag and untag", async () => {
    // Given a Role allowed to change and read a table's tags.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Tagger",
        actions: [
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:ListTagsOfResource",
        ],
      },
      simAws,
    );
    const caller = { caller: { kind: "arn", arn: role.Arn } } as const;

    // When the Role tags the table, takes one off and lists the rest.
    await simDynamoDb.tagResource(
      new TagResourceCommand({
        ResourceArn: table.arn,
        Tags: [
          { Key: "Environment", Value: "test" },
          { Key: "Owner", Value: "platform" },
        ],
      }),
      caller,
    );
    await simDynamoDb.untagResource(
      new UntagResourceCommand({
        ResourceArn: table.arn,
        TagKeys: ["Owner"],
      }),
      caller,
    );
    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
      caller,
    );

    // Then IAM allows all three.
    assertArrayLength(output.Tags, 1);
    assertObjectEquals(output.Tags[0], { Key: "Environment", Value: "test" });
  });

  it("denies a Role that may read tags but not change them", async () => {
    // Given a Role allowed only to list tags.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "TagReader", actions: ["dynamodb:ListTagsOfResource"] },
      simAws,
    );
    const caller = { caller: { kind: "arn", arn: role.Arn } } as const;

    // When the Role tries to tag the table.
    const tagging = await assertThrowsErrorAsync(async () =>
      simDynamoDb.tagResource(
        new TagResourceCommand({
          ResourceArn: table.arn,
          Tags: [{ Key: "Environment", Value: "test" }],
        }),
        caller,
      ),
    );

    // And when it tries to take a tag off.
    const untagging = await assertThrowsErrorAsync(async () =>
      simDynamoDb.untagResource(
        new UntagResourceCommand({
          ResourceArn: table.arn,
          TagKeys: ["Environment"],
        }),
        caller,
      ),
    );

    // Then each is denied against its own action, and nothing was tagged.
    assertInstanceOf(tagging, SimIamAccessDenied);
    assertIdentical(tagging.action, "dynamodb:TagResource");
    assertInstanceOf(untagging, SimIamAccessDenied);
    assertIdentical(untagging.action, "dynamodb:UntagResource");

    const output = await simDynamoDb.listTagsOfResource(
      new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
      caller,
    );
    assertArrayEmpty(output.Tags);
  });

  it("denies a Role that may change tags but not read them", async () => {
    // Given a Role allowed only to tag.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "TagWriter", actions: ["dynamodb:TagResource"] },
      simAws,
    );

    // When the Role lists the tags.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTagsOfResource(
        new ListTagsOfResourceCommand({ ResourceArn: table.arn }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // Then reading tags is its own action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:ListTagsOfResource");
  });

  it("denies a tag command for a table the Role may not reach", async () => {
    // Given a Role allowed to tag one table only.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCreatedTableFactory.make(
      { tableName: "OrdersTable", partitionKeyName: "orderId" },
      simAws,
    );
    const customers = await simDynamoDbCreatedTableFactory.make(
      { tableName: "CustomersTable", partitionKeyName: "customerId" },
      simAws,
    );
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrdersTagger",
        actions: ["dynamodb:TagResource"],
        resource:
          `arn:aws:dynamodb:${simAws.defaultRegionName}:` +
          `${simAws.defaultAccountId}:table/OrdersTable`,
      },
      simAws,
    );

    // When it tags the other one.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.tagResource(
        new TagResourceCommand({
          ResourceArn: customers.arn,
          Tags: [{ Key: "Environment", Value: "test" }],
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // Then the table ARN is what the policy is evaluated against.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:TagResource");
  });
});
