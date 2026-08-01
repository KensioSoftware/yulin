import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  TransactGetItemsCommand,
  TransactWriteItemsCommand,
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

const ledgerTable = new CreateTableCommand({
  TableName: "LedgerTable",
  KeySchema: [{ AttributeName: "entryId", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "entryId", AttributeType: "S" }],
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

/**
 * A Role allowed the DynamoDB actions it is given, and nothing else.
 */
async function roleAllowed(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<string> {
  const simIam = simAws.iam();
  const creation = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: trustPolicy(simAws.defaultAccountId),
    }),
  );

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: `${roleName}Policy`,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: actions, Resource: "*" },
      }),
    }),
  );

  return creation.Role.Arn;
}

describe("DynamoDB transactional item command IAM authorization", () => {
  it("authorizes a transaction as the operations it is made of", async () => {
    // Given a Role allowed to put and to update items.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(ledgerTable);
    await simAws.backgroundTasksComplete();

    const arn = await roleAllowed(simAws, "LedgerWriter", [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]);

    // When the Role writes a transaction doing both.
    await simDynamoDb.transactWriteItems(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: "LedgerTable",
              Item: { entryId: { S: "entry-1" } },
            },
          },
          {
            Update: {
              TableName: "LedgerTable",
              Key: { entryId: { S: "entry-2" } },
              UpdateExpression: "SET amount = :amount",
              ExpressionAttributeValues: { ":amount": { N: "25" } },
            },
          },
        ],
      }),
      { caller: { kind: "arn", arn } },
    );

    // Then IAM allows the request, since a transaction needs the actions of
    // the operations it carries rather than one of its own.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertIdentical(output.Item?.["entryId"]?.S, "entry-1");
  });

  it("denies a transaction carrying an action the Role may not take", async () => {
    // Given a Role allowed to put items but not to delete them.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(ledgerTable);
    await simAws.backgroundTasksComplete();

    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "LedgerTable",
        Item: { entryId: { S: "entry-2" } },
      }),
    );

    const arn = await roleAllowed(simAws, "PutOnlyWriter", [
      "dynamodb:PutItem",
    ]);

    // When the Role writes a transaction that puts one item and deletes
    // another.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: "LedgerTable",
                Item: { entryId: { S: "entry-1" } },
              },
            },
            {
              Delete: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-2" } },
              },
            },
          ],
        }),
        { caller: { kind: "arn", arn } },
      ),
    );

    // Then the whole transaction is denied, and neither item was touched.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:DeleteItem");

    const written = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-1" } },
      }),
    );
    assertUndefined(written.Item);

    const deleted = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "LedgerTable",
        Key: { entryId: { S: "entry-2" } },
      }),
    );
    assertIdentical(deleted.Item?.["entryId"]?.S, "entry-2");
  });

  it("needs dynamodb:ConditionCheckItem for a ConditionCheck", async () => {
    // Given a Role allowed to put items but not to check them.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(ledgerTable);
    await simAws.backgroundTasksComplete();

    const arn = await roleAllowed(simAws, "CheckLessWriter", [
      "dynamodb:PutItem",
    ]);

    // When the Role writes a transaction guarded by a condition check.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-2" } },
                ConditionExpression: "attribute_exists(entryId)",
              },
            },
            {
              Put: {
                TableName: "LedgerTable",
                Item: { entryId: { S: "entry-1" } },
              },
            },
          ],
        }),
        { caller: { kind: "arn", arn } },
      ),
    );

    // Then it is denied, since a condition check is an action of its own.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:ConditionCheckItem");
  });

  it("denies a caller replaying a token it has no permission for", async () => {
    // Given a transaction that has already been applied under a token.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(ledgerTable);
    await simAws.backgroundTasksComplete();

    const entry = {
      TransactItems: [
        {
          Put: {
            TableName: "LedgerTable",
            Item: { entryId: { S: "entry-1" } },
          },
        },
      ],
      ClientRequestToken: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    };

    await simDynamoDb.transactWriteItems(new TransactWriteItemsCommand(entry));

    const arn = await roleAllowed(simAws, "NoWriter", ["dynamodb:GetItem"]);

    // When a Role with no permission to write replays the same token.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactWriteItems(new TransactWriteItemsCommand(entry), {
        caller: { kind: "arn", arn },
      }),
    );

    // Then it is denied rather than answered as a retry, since IAM evaluates a
    // request before the service handles it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:PutItem");
  });

  it("needs dynamodb:GetItem for a transactional read", async () => {
    // Given a Role allowed to write items but not to read them.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDb.createTable(ledgerTable);
    await simAws.backgroundTasksComplete();

    const arn = await roleAllowed(simAws, "WriteOnlyReader", [
      "dynamodb:PutItem",
    ]);

    // When the Role reads a transaction.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.transactGetItems(
        new TransactGetItemsCommand({
          TransactItems: [
            {
              Get: {
                TableName: "LedgerTable",
                Key: { entryId: { S: "entry-1" } },
              },
            },
          ],
        }),
        { caller: { kind: "arn", arn } },
      ),
    );

    // Then it is denied: a transactional read is authorized as the GetItem it
    // is made of.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:GetItem");
  });
});
