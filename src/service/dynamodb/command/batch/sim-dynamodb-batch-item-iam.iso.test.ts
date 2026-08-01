import {
  BatchGetItemCommand,
  BatchWriteItemCommand,
  CreateTableCommand,
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
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const ordersTable = new CreateTableCommand({
  TableName: "OrdersTable",
  KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
});

const archivedOrdersTable = new CreateTableCommand({
  TableName: "ArchivedOrdersTable",
  KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
});

const trustPolicy = (accountId: string): string =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Principal: { AWS: `arn:aws:iam::${accountId}:root` },
      Action: "sts:AssumeRole",
    },
  });

describe("DynamoDB batch item command IAM authorization", () => {
  it("allows a Role its policy permits dynamodb:BatchWriteItem", async () => {
    // Given a Role allowed to write items to the table in batches.
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    const simDynamoDb = simAws.dynamoDb();
    const simIam = simAws.iam();

    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    const creation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "BatchWriter",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "BatchWriter",
        PolicyName: "BatchWritePolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:BatchWriteItem",
            Resource: "*",
          },
        }),
      }),
    );

    // When the Role writes a batch.
    await simDynamoDb.batchWriteItem(
      new BatchWriteItemCommand({
        RequestItems: {
          OrdersTable: [
            { PutRequest: { Item: { orderId: { S: "order-1" } } } },
          ],
        },
      }),
      { caller: { kind: "arn", arn: creation.Role.Arn } },
    );

    // Then IAM allows the request and the item is there.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(output.Item?.["orderId"]?.S, "order-1");
  });

  it("denies a batch write for a table the Role may not write to", async () => {
    // Given a Role allowed to write to one of the two tables a batch names.
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    const region = simAws.defaultRegionName;
    const simDynamoDb = simAws.dynamoDb();
    const simIam = simAws.iam();

    await simDynamoDb.createTable(ordersTable);
    await simDynamoDb.createTable(archivedOrdersTable);
    await simAws.backgroundTasksComplete();

    const creation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PartialBatchWriter",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "PartialBatchWriter",
        PolicyName: "OneTablePolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:BatchWriteItem",
            Resource: `arn:aws:dynamodb:${region}:${accountId}:table/OrdersTable`,
          },
        }),
      }),
    );

    // When the Role writes a batch naming both.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchWriteItem(
        new BatchWriteItemCommand({
          RequestItems: {
            OrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            ],
            ArchivedOrdersTable: [
              { PutRequest: { Item: { orderId: { S: "order-1" } } } },
            ],
          },
        }),
        { caller: { kind: "arn", arn: creation.Role.Arn } },
      ),
    );

    // Then the whole batch is denied, and the table the Role could write to is
    // untouched.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:BatchWriteItem");

    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "OrdersTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertUndefined(output.Item);
  });

  it("does not let permission to read one item read a batch", async () => {
    // Given a Role allowed only to read one item at a time.
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    const simDynamoDb = simAws.dynamoDb();
    const simIam = simAws.iam();

    await simDynamoDb.createTable(ordersTable);
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { orderId: { S: "order-1" } },
      }),
    );

    const creation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "SingleItemReader",
        AssumeRolePolicyDocument: trustPolicy(accountId),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SingleItemReader",
        PolicyName: "GetItemPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:GetItem",
            Resource: "*",
          },
        }),
      }),
    );

    // When the Role reads a batch.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.batchGetItem(
        new BatchGetItemCommand({
          RequestItems: {
            OrdersTable: { Keys: [{ orderId: { S: "order-1" } }] },
          },
        }),
        { caller: { kind: "arn", arn: creation.Role.Arn } },
      ),
    );

    // Then each DynamoDB operation is its own IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:BatchGetItem");
  });
});
