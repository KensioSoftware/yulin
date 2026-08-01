import { ScanCommand } from "@aws-sdk/client-dynamodb";
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
 * One simulated Account and Region, with a table holding one item.
 */
interface ScanScope {
  readonly accountId: string;
  readonly region: string;
  readonly simAws: SimAws;
  readonly simDynamoDb: SimDynamoDb;
}

/**
 * A scope with a table to scan.
 */
async function scanScope(): Promise<ScanScope> {
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
async function roleArnFor(scope: ScanScope, roleName: string): Promise<string> {
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
  scope: ScanScope,
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

describe("DynamoDB ScanCommand IAM authorization", () => {
  it("allows a Role its policy permits dynamodb:Scan", async () => {
    // Given a Role allowed to scan the table.
    const scope = await scanScope();
    const roleArn = await roleArnFor(scope, "TableReader");
    await allow(scope, "TableReader", "dynamodb:Scan");

    // When the Role scans it.
    const output = await scope.simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows the request.
    assertArrayLength(output.Items ?? [], 1);
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no DynamoDB permissions.
    const scope = await scanScope();
    const roleArn = await roleArnFor(scope, "NoScanRole");

    // When the Role attempts to scan the table.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.scan(new ScanCommand({ TableName: "OrdersTable" }), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM denies the request, naming the action and the table ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:Scan");
    assertIdentical(
      error.resource,
      `arn:aws:dynamodb:${scope.region}:${scope.accountId}:table/OrdersTable`,
    );
  });

  it("does not let permission to query read the whole table", async () => {
    // Given a Role allowed only to read one item collection at a time.
    const scope = await scanScope();
    const roleArn = await roleArnFor(scope, "QueryOnlyRole");
    await allow(scope, "QueryOnlyRole", "dynamodb:Query");

    // When the Role attempts to scan.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.scan(new ScanCommand({ TableName: "OrdersTable" }), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then each DynamoDB operation is its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:Scan");
  });
});
