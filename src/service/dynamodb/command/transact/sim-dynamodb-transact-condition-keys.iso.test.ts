import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import type { SimIamPolicyDocumentStatement } from "../../../iam/policy/sim-iam-policy.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";

const tableName = "OrdersTable";

const itemActions = [
  "dynamodb:ConditionCheckItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:GetItem",
];

/**
 * A stocked table, and a caller whose policy holds the statements given.
 */
async function callerWith(
  statements: readonly SimIamPolicyDocumentStatement[],
): Promise<{ readonly simAws: SimAws; readonly caller: SimAwsCaller }> {
  const simAws = new SimAws();
  await simDynamoDbStockedTableFactory.make({ tableName }, simAws);
  const simIam = simAws.iam();
  const creation = await simIam.createRole({
    input: {
      RoleName: "TransactRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    },
  });
  await simIam.putRolePolicy({
    input: {
      RoleName: "TransactRole",
      PolicyName: "TransactPolicy",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statements,
      }),
    },
  });

  return { simAws, caller: { kind: "arn", arn: creation.Role.Arn } };
}

/**
 * A put of one order for a customer.
 */
function order(customerId: string): Record<string, { S: string }> {
  return { customerId: { S: customerId }, orderId: { S: "2026-09" } };
}

describe("DynamoDB transaction condition keys", () => {
  it("lets a policy deny transactional writes and allow plain ones", async () => {
    // Given the developer guide's policy blocking transactional reads and
    // writes while allowing the same actions outside a transaction.
    const { simAws, caller } = await callerWith([
      {
        Effect: "Deny",
        Action: itemActions,
        Resource: "*",
        Condition: {
          "ForAnyValue:StringEquals": {
            "dynamodb:EnclosingOperation": [
              "TransactWriteItems",
              "TransactGetItems",
            ],
          },
        },
      },
      { Effect: "Allow", Action: itemActions, Resource: "*" },
    ]);
    const dynamoDb = simAws.dynamoDb();

    // When it puts an order plainly and then inside a transaction.
    await dynamoDb.putItem(
      { input: { TableName: tableName, Item: order("c-1") } },
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () =>
      dynamoDb.transactWriteItems(
        {
          input: {
            TransactItems: [
              { Put: { TableName: tableName, Item: order("c-2") } },
            ],
          },
        },
        { caller },
      ),
    );

    // Then the plain put goes through and the transactional one is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes each action by its own partition key", async () => {
    // Given a caller allowed the item actions for customer c-1 only.
    const { simAws, caller } = await callerWith([
      {
        Effect: "Allow",
        Action: itemActions,
        Resource: "*",
        Condition: {
          "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["c-1"] },
        },
      },
    ]);
    const dynamoDb = simAws.dynamoDb();

    // When one transaction touches c-1 alone, and another reaches c-2 too.
    await dynamoDb.transactWriteItems(
      {
        input: {
          TransactItems: [
            { Put: { TableName: tableName, Item: order("c-1") } },
          ],
        },
      },
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () =>
      dynamoDb.transactGetItems(
        {
          input: {
            TransactItems: [
              { Get: { TableName: tableName, Key: order("c-1") } },
              { Get: { TableName: tableName, Key: order("c-2") } },
            ],
          },
        },
        { caller },
      ),
    );

    // Then the second is denied for the item outside the caller's partition.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "dynamodb:GetItem");
  });

  it("refuses a condition check asking for the item it failed on", async () => {
    // Given the developer guide's policy keeping a failed check's item back.
    const { simAws, caller } = await callerWith([
      {
        Effect: "Allow",
        Action: itemActions,
        Resource: "*",
        Condition: {
          StringEqualsIfExists: { "dynamodb:ReturnValues": "NONE" },
        },
      },
    ]);

    // When a transaction's condition check asks for ALL_OLD on failure.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().transactWriteItems(
        {
          input: {
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: { customerId: { S: "c-1" }, orderId: { S: "2026-01" } },
                  ConditionExpression: "attribute_exists(customerId)",
                  ReturnValuesOnConditionCheckFailure: "ALL_OLD",
                },
              },
            ],
          },
        },
        { caller },
      ),
    );

    // Then the transaction is denied before anything is checked.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
