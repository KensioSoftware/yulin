import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringEndsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * One simulated Account and Region, with a table carrying a global secondary
 * index.
 */
interface IndexQueryScope {
  readonly accountId: string;
  readonly region: string;
  readonly simAws: SimAws;
  readonly simDynamoDb: SimDynamoDb;
  readonly tableArn: string;
}

/**
 * A scope with one order, readable by its customer or by its status.
 */
async function indexQueryScope(): Promise<IndexQueryScope> {
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
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "byStatus",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
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
 * A Role allowed `dynamodb:Query` on exactly the resources given.
 */
async function queryRoleFor(
  scope: IndexQueryScope,
  roleName: string,
  resources: readonly string[],
  condition?: object,
): Promise<string> {
  const iam = scope.simAws.account(scope.accountId).iam();
  const statement: Record<string, unknown> = {
    Effect: "Allow",
    Action: "dynamodb:Query",
    Resource: resources,
  };
  if (condition !== undefined) {
    statement["Condition"] = condition;
  }
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
      PolicyName: "QueryPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return creation.Role.Arn;
}

/**
 * The orders a status names, read through the index.
 */
function statusQuery(indexName = "byStatus"): QueryCommand {
  return new QueryCommand({
    TableName: "OrdersTable",
    IndexName: indexName,
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "pending" } },
  });
}

/**
 * The orders a customer placed, read from the table itself.
 */
function customerQuery(): QueryCommand {
  return new QueryCommand({
    TableName: "OrdersTable",
    KeyConditionExpression: "customerId = :customer",
    ExpressionAttributeValues: { ":customer": { S: "c-1" } },
  });
}

describe("DynamoDB QueryCommand IAM authorization of an index", () => {
  it("refuses a Role allowed only the table ARN when it queries an index", async () => {
    // Given a Role allowed to query the table ARN, as a grant on a table
    // imported by name gives it.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(scope, "TableOnlyReader", [
      scope.tableArn,
    ]);

    // When the Role queries the table's index.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.query(statusQuery(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM refuses it, naming the index ARN as AWS does.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:Query");
    assertIdentical(error.resource, `${scope.tableArn}/index/byStatus`);
    assertStringEndsWith(
      error.message,
      `is not authorized to perform: dynamodb:Query on resource: ${scope.tableArn}/index/byStatus`,
    );
  });

  it("still lets a Role allowed only the table ARN query the table", async () => {
    // Given a Role allowed to query the table ARN alone.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(scope, "TableReader", [scope.tableArn]);

    // When the Role queries the table rather than an index.
    const output = await scope.simDynamoDb.query(customerQuery(), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then IAM allows it.
    assertArrayLength(output.Items ?? [], 1);
  });

  it("lets a Role allowed every index of the table query one", async () => {
    // Given a Role allowed the table and every index under it, as CDK grants
    // a table that knows it has indexes.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(scope, "AllIndexReader", [
      scope.tableArn,
      `${scope.tableArn}/index/*`,
    ]);

    // When the Role queries the index.
    const output = await scope.simDynamoDb.query(statusQuery(), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then IAM allows it.
    assertArrayLength(output.Items ?? [], 1);
  });

  it("lets a Role allowed the one index ARN query that index", async () => {
    // Given a Role allowed the index's own ARN and nothing else.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(scope, "StatusReader", [
      `${scope.tableArn}/index/byStatus`,
    ]);

    // When the Role queries the index.
    const output = await scope.simDynamoDb.query(statusQuery(), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then IAM allows it.
    assertArrayLength(output.Items ?? [], 1);
  });

  it("refuses a Role allowed only the index ARN when it queries the table", async () => {
    // Given a Role allowed the index's own ARN and nothing else.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(scope, "IndexOnlyReader", [
      `${scope.tableArn}/index/byStatus`,
    ]);

    // When the Role queries the base table.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.query(customerQuery(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM refuses it against the table ARN, which the index ARN does not
    // reach.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, scope.tableArn);
  });

  it("refuses an index the table lacks before saying it is missing", async () => {
    // Given a Role allowed only the table ARN.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(scope, "Prober", [scope.tableArn]);

    // When the Role queries an index the table does not have.
    const error = await assertThrowsErrorAsync(async () =>
      scope.simDynamoDb.query(statusQuery("byRegion"), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM refuses it against the ARN that index would have, so the
    // caller learns nothing about which indexes exist.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, `${scope.tableArn}/index/byRegion`);
  });

  it("matches dynamodb:LeadingKeys on an index against the index partition key", async () => {
    // Given a Role allowed to query the index for pending orders only.
    const scope = await indexQueryScope();
    const roleArn = await queryRoleFor(
      scope,
      "PendingReader",
      [`${scope.tableArn}/index/byStatus`],
      { "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["pending"] } },
    );

    // When the Role queries the index for pending orders.
    const output = await scope.simDynamoDb.query(statusQuery(), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then the partition key value the condition sees is the index's own.
    assertArrayLength(output.Items ?? [], 1);
  });
});
