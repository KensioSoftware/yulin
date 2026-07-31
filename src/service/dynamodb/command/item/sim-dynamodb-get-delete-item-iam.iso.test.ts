import {
  CreateTableCommand,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * One simulated Account and Region, with a table holding one item.
 */
interface ItemScope {
  readonly accountId: string;
  readonly region: string;
  readonly simAws: SimAws;
  readonly simDynamoDb: SimDynamoDb;
}

/**
 * A scope with a table to read from and delete from.
 */
async function itemScope(): Promise<ItemScope> {
  const accountId = makeSimAwsAccountId();
  const region = makeAwsRegionName();
  const simAws = new SimAws();
  const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "ItemTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "ItemTable",
      Item: { id: { S: "item-1" }, note: { S: "first" } },
    }),
  );

  return { accountId, region, simAws, simDynamoDb };
}

/**
 * A Role that may assume itself from the Account root, and nothing else.
 */
async function roleArnFor(scope: ItemScope, roleName: string): Promise<string> {
  const simIam = scope.simAws.account(scope.accountId).iam();

  const creation = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${scope.accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  return creation.Role.Arn;
}

/**
 * Allow one DynamoDB action on the table this scope holds.
 */
async function allow(
  scope: ItemScope,
  roleName: string,
  action: string,
): Promise<void> {
  await scope.simAws
    .account(scope.accountId)
    .iam()
    .putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: `${action.replace(":", "")}Policy`,
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: action,
            Resource: `arn:aws:dynamodb:${scope.region}:${scope.accountId}:table/ItemTable`,
          },
        }),
      }),
    );
}

describe("DynamoDB GetItemCommand IAM authorization", () => {
  it("allows a Role its policy permits dynamodb:GetItem", async () => {
    // Given a Role allowed to read items from the table.
    const scope = await itemScope();
    const roleArn = await roleArnFor(scope, "ItemReader");
    await allow(scope, "ItemReader", "dynamodb:GetItem");

    // When the Role reads an item.
    const output = await scope.simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows the request.
    assertIdentical(output.Item?.["note"]?.S, "first");
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no DynamoDB permissions.
    const scope = await itemScope();
    const roleArn = await roleArnFor(scope, "NoReadRole");

    // When the Role attempts to read an item.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.getItem(
        new GetItemCommand({
          TableName: "ItemTable",
          Key: { id: { S: "item-1" } },
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM denies the request, naming the action and the table ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:GetItem");
    assertIdentical(
      error.resource,
      `arn:aws:dynamodb:${scope.region}:${scope.accountId}:table/ItemTable`,
    );
  });

  it("does not let permission to write an item read one", async () => {
    // Given a Role allowed only to write items.
    const scope = await itemScope();
    const roleArn = await roleArnFor(scope, "WriteOnlyRole");
    await allow(scope, "WriteOnlyRole", "dynamodb:PutItem");

    // When the Role attempts to read one.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.getItem(
        new GetItemCommand({
          TableName: "ItemTable",
          Key: { id: { S: "item-1" } },
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then each DynamoDB operation is its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:GetItem");
  });
});

describe("DynamoDB DeleteItemCommand IAM authorization", () => {
  it("allows a Role its policy permits dynamodb:DeleteItem", async () => {
    // Given a Role allowed to delete items from the table.
    const scope = await itemScope();
    const roleArn = await roleArnFor(scope, "ItemDeleter");
    await allow(scope, "ItemDeleter", "dynamodb:DeleteItem");

    // When the Role deletes an item.
    const output = await scope.simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows the request.
    assertUndefined(output.Attributes);
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no DynamoDB permissions.
    const scope = await itemScope();
    const roleArn = await roleArnFor(scope, "NoDeleteRole");

    // When the Role attempts to delete an item.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.deleteItem(
        new DeleteItemCommand({
          TableName: "ItemTable",
          Key: { id: { S: "item-1" } },
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM denies the request, naming the action and the table ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:DeleteItem");
    assertIdentical(
      error.resource,
      `arn:aws:dynamodb:${scope.region}:${scope.accountId}:table/ItemTable`,
    );
  });

  it("denies the delete before it removes anything", async () => {
    // Given a Role with no DynamoDB permissions.
    const scope = await itemScope();
    const roleArn = await roleArnFor(scope, "DeniedDeleteRole");

    // When the Role attempts to delete an item and is denied.
    await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.deleteItem(
        new DeleteItemCommand({
          TableName: "ItemTable",
          Key: { id: { S: "item-1" } },
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then the item is still there.
    const output = await scope.simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "ItemTable",
        Key: { id: { S: "item-1" } },
      }),
    );
    assertIdentical(output.Item?.["note"]?.S, "first");
  });
});
