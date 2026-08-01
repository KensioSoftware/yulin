import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * One simulated Account and Region, with a table holding one item collection.
 */
interface QueryScope {
  readonly accountId: string;
  readonly region: string;
  readonly simAws: SimAws;
  readonly simDynamoDb: SimDynamoDb;
}

/**
 * A scope with a collection to read.
 */
async function queryScope(): Promise<QueryScope> {
  const accountId = makeSimAwsAccountId();
  const region = makeAwsRegionName();
  const simAws = new SimAws();
  const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

  await simDynamoDb.createTable({
    input: {
      TableName: "OrdersTable",
      KeySchema: [
        { AttributeName: "customerId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    },
  });
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem({
    input: {
      TableName: "OrdersTable",
      Item: { customerId: { S: "c-1" }, orderId: { S: "order-1" } },
    },
  });

  return { accountId, region, simAws, simDynamoDb };
}

/**
 * A Role that may assume itself from the Account root, and nothing else.
 */
async function roleArnFor(
  scope: QueryScope,
  roleName: string,
): Promise<string> {
  const creation = await scope.simAws
    .account(scope.accountId)
    .iam()
    .createRole(
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
  scope: QueryScope,
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
            Resource: `arn:aws:dynamodb:${scope.region}:${scope.accountId}:table/OrdersTable`,
          },
        }),
      }),
    );
}

/**
 * The query these tests authorize.
 */
function collectionQuery(): QueryCommand {
  return new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    ExpressionAttributeValues: { ":customer": { S: "c-1" } },
  });
}

describe("DynamoDB QueryCommand IAM authorization", () => {
  it("allows a Role its policy permits dynamodb:Query", async () => {
    // Given a Role allowed to query the table.
    const scope = await queryScope();
    const roleArn = await roleArnFor(scope, "CollectionReader");
    await allow(scope, "CollectionReader", "dynamodb:Query");

    // When the Role reads the collection.
    const output = await scope.simDynamoDb.query(collectionQuery(), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then IAM allows the request.
    assertArrayLength(output.Items ?? [], 1);
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no DynamoDB permissions.
    const scope = await queryScope();
    const roleArn = await roleArnFor(scope, "NoQueryRole");

    // When the Role attempts to read the collection.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.query(collectionQuery(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM denies the request, naming the action and the table ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:Query");
    assertIdentical(
      error.resource,
      `arn:aws:dynamodb:${scope.region}:${scope.accountId}:table/OrdersTable`,
    );
  });

  it("does not let permission to read one item read a collection", async () => {
    // Given a Role allowed only to read one item at a time.
    const scope = await queryScope();
    const roleArn = await roleArnFor(scope, "GetOnlyRole");
    await allow(scope, "GetOnlyRole", "dynamodb:GetItem");

    // When the Role attempts to query.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.query(collectionQuery(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then each DynamoDB operation is its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:Query");
  });
});
