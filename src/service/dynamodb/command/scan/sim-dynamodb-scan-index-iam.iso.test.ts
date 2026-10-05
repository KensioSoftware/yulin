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
 * One simulated Account and Region, with a table carrying a global and a local
 * secondary index.
 */
interface IndexScanScope {
  readonly accountId: string;
  readonly region: string;
  readonly simAws: SimAws;
  readonly simDynamoDb: SimDynamoDb;
  readonly tableArn: string;
}

/**
 * A scope with one order, held in the table and in both indexes.
 */
async function indexScanScope(): Promise<IndexScanScope> {
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
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "placedAt", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      LocalSecondaryIndexes: [
        {
          IndexName: "byPlacedAt",
          KeySchema: [
            { AttributeName: "customerId", KeyType: "HASH" },
            { AttributeName: "placedAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    },
  });
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem({
    input: {
      TableName: "OrdersTable",
      Item: {
        customerId: { S: "c-1" },
        orderId: { S: "order-1" },
        status: { S: "pending" },
        placedAt: { S: "2026-01-01T00:00:00Z" },
      },
    },
  });

  return {
    accountId,
    region,
    simAws,
    simDynamoDb,
    tableArn: `arn:aws:dynamodb:${region}:${accountId}:table/OrdersTable`,
  };
}

/**
 * A Role allowed `dynamodb:Scan` on exactly the resources given.
 */
async function scanRoleFor(
  scope: IndexScanScope,
  roleName: string,
  resources: readonly string[],
): Promise<string> {
  const iam = scope.simAws.account(scope.accountId).iam();
  const creation = await iam.createRole(
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
  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "ScanPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "dynamodb:Scan",
          Resource: resources,
        },
      }),
    }),
  );

  return creation.Role.Arn;
}

describe("DynamoDB ScanCommand IAM authorization of an index", () => {
  it("refuses a Role allowed only the table ARN when it scans a global secondary index", async () => {
    // Given a Role allowed to scan the table ARN alone.
    const scope = await indexScanScope();
    const roleArn = await scanRoleFor(scope, "TableOnlyScanner", [
      scope.tableArn,
    ]);

    // When the Role scans the global secondary index.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", IndexName: "byStatus" }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM refuses it, naming the index ARN as AWS does.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:Scan");
    assertIdentical(error.resource, `${scope.tableArn}/index/byStatus`);
  });

  it("refuses a Role allowed only the table ARN when it scans a local secondary index", async () => {
    // Given a Role allowed to scan the table ARN alone.
    const scope = await indexScanScope();
    const roleArn = await scanRoleFor(scope, "LocalScanner", [scope.tableArn]);

    // When the Role scans the local secondary index, which shares the table's
    // partitions.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", IndexName: "byPlacedAt" }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then a local index is authorized by its own ARN as a global one is.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, `${scope.tableArn}/index/byPlacedAt`);
  });

  it("still lets a Role allowed only the table ARN scan the table", async () => {
    // Given a Role allowed to scan the table ARN alone.
    const scope = await indexScanScope();
    const roleArn = await scanRoleFor(scope, "TableScanner", [scope.tableArn]);

    // When the Role scans the table rather than an index.
    const output = await scope.simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows it.
    assertArrayLength(output.Items ?? [], 1);
  });

  it("lets a Role allowed every index of the table scan both kinds", async () => {
    // Given a Role allowed every index under the table.
    const scope = await indexScanScope();
    const roleArn = await scanRoleFor(scope, "AllIndexScanner", [
      `${scope.tableArn}/index/*`,
    ]);
    const caller = { kind: "arn", arn: roleArn } as const;

    // When the Role scans each index.
    const global = await scope.simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", IndexName: "byStatus" }),
      { caller },
    );
    const local = await scope.simDynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", IndexName: "byPlacedAt" }),
      { caller },
    );

    // Then IAM allows both.
    assertArrayLength(global.Items ?? [], 1);
    assertArrayLength(local.Items ?? [], 1);
  });

  it("refuses a Role allowed only the index ARN when it scans the table", async () => {
    // Given a Role allowed one index's ARN and nothing else.
    const scope = await indexScanScope();
    const roleArn = await scanRoleFor(scope, "IndexOnlyScanner", [
      `${scope.tableArn}/index/byStatus`,
    ]);

    // When the Role scans the base table.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.scan(new ScanCommand({ TableName: "OrdersTable" }), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM refuses it against the table ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, scope.tableArn);
  });
});
