import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";

const tableName = "OrdersTable";

/**
 * The item actions DynamoDB supplies `dynamodb:LeadingKeys` for.
 */
const scopedActions = [
  "dynamodb:GetItem",
  "dynamodb:BatchGetItem",
  "dynamodb:Query",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:BatchWriteItem",
];

/**
 * A caller allowed the item actions on the table, for one partition key only.
 *
 * This is the fine-grained access control policy the DynamoDB developer guide
 * writes, with the customer named outright rather than through a federated
 * identity substitution variable.
 */
async function callerScopedTo(
  simAws: SimAws,
  allowed: string,
): Promise<SimAwsCaller> {
  const simIam = simAws.iam();
  const roleName = "CustomerRole";
  const creation = await simIam.createRole({
    input: {
      RoleName: roleName,
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
      RoleName: roleName,
      PolicyName: "OwnItemsOnly",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: scopedActions,
          Resource: `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/${tableName}`,
          Condition: {
            "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": [allowed] },
          },
        },
      }),
    },
  });

  return { kind: "arn", arn: creation.Role.Arn };
}

/**
 * One request against the table, named by the customer whose items it reaches.
 */
const requests = {
  "dynamodb:GetItem": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().getItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: customerId }, orderId: { S: "2026-01" } },
        },
      },
      { caller },
    ),

  "dynamodb:Query": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().query(
      {
        input: {
          TableName: tableName,
          KeyConditionExpression: "customerId = :customerId",
          ExpressionAttributeValues: { ":customerId": { S: customerId } },
        },
      },
      { caller },
    ),

  "dynamodb:PutItem": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().putItem(
      {
        input: {
          TableName: tableName,
          Item: { customerId: { S: customerId }, orderId: { S: "2026-09" } },
        },
      },
      { caller },
    ),

  "dynamodb:UpdateItem": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().updateItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: customerId }, orderId: { S: "2026-01" } },
          UpdateExpression: "SET #status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": { S: "PAID" } },
        },
      },
      { caller },
    ),

  "dynamodb:DeleteItem": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().deleteItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: customerId }, orderId: { S: "2026-01" } },
        },
      },
      { caller },
    ),

  "dynamodb:BatchGetItem": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().batchGetItem(
      {
        input: {
          RequestItems: {
            [tableName]: {
              Keys: [
                { customerId: { S: "c-1" }, orderId: { S: "2026-01" } },
                { customerId: { S: customerId }, orderId: { S: "2026-02" } },
              ],
            },
          },
        },
      },
      { caller },
    ),

  "dynamodb:BatchWriteItem": async (
    simAws: SimAws,
    customerId: string,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().batchWriteItem(
      {
        input: {
          RequestItems: {
            [tableName]: [
              {
                PutRequest: {
                  Item: {
                    customerId: { S: "c-1" },
                    orderId: { S: "2026-09" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    customerId: { S: customerId },
                    orderId: { S: "2026-10" },
                  },
                },
              },
            ],
          },
        },
      },
      { caller },
    ),
} as const;

describe("DynamoDB dynamodb:LeadingKeys authorization", () => {
  it.each(scopedActions)(
    "allows %s where every partition key the request reaches is the caller's",
    async (action) => {
      // Given a caller scoped to one customer's items.
      const simAws = new SimAws();
      await simDynamoDbStockedTableFactory.make({}, simAws);
      const caller = await callerScopedTo(simAws, "c-1");

      // When it reaches only that customer's items.
      const answer = await requests[action as keyof typeof requests](
        simAws,
        "c-1",
        caller,
      );

      // Then the condition holds and the request is answered.
      assertNonNullable(answer);
    },
  );

  it.each(scopedActions)(
    "refuses %s where the request reaches another customer's partition key",
    async (action) => {
      // Given the same caller, scoped to one customer's items.
      const simAws = new SimAws();
      await simDynamoDbStockedTableFactory.make({}, simAws);
      const caller = await callerScopedTo(simAws, "c-1");

      // When it reaches an item under another customer's partition key.
      const error = await assertThrowsErrorAsync(async () =>
        requests[action as keyof typeof requests](simAws, "c-2", caller),
      );

      // Then the condition fails and the whole request is refused.
      assertInstanceOf(error, SimIamAccessDenied);
      assertIdentical(error.action, action);
    },
  );

  it("compares a number partition key by its digits", async () => {
    // Given a table keyed by a number and a caller scoped to one of them.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable({
      input: {
        TableName: tableName,
        KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "N" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      },
    });
    const caller = await callerScopedTo(simAws, "42");

    // When it writes the item under that number, written with a trailing zero.
    await simAws.dynamoDb().putItem(
      {
        input: { TableName: tableName, Item: { customerId: { N: "42.0" } } },
      },
      { caller },
    );

    // Then the digits DynamoDB holds the number as are what the policy matched.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().putItem(
        {
          input: { TableName: tableName, Item: { customerId: { N: "43" } } },
        },
        { caller },
      ),
    );
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a caller before saying whether the table is there", async () => {
    // Given a caller allowed nothing, and a table that was never created.
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "NoItemsRole" },
      simAws,
    );

    // When it reads an item of that table.
    const error = await assertThrowsErrorAsync(async () =>
      requests["dynamodb:GetItem"](simAws, "c-1", {
        kind: "arn",
        arn: role.Arn,
      }),
    );

    // Then it hears AccessDenied rather than the table being missing. Reading
    // the partition key values needs the table, and finding it first is what
    // could otherwise have told a refused caller which names are taken.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a request naming no partition key value it can read", async () => {
    // Given a caller scoped to one customer and a table keyed by binary.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable({
      input: {
        TableName: tableName,
        KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "B" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      },
    });
    const caller = await callerScopedTo(simAws, "c-1");

    // When it writes an item whose partition key has no policy form.
    const written = await simAws.dynamoDb().putItem(
      {
        input: {
          TableName: tableName,
          Item: { customerId: { B: new Uint8Array([1, 2, 3]) } },
        },
      },
      { caller },
    );

    // Then the key is absent from the condition context, and a ForAllValues
    // condition matches a request carrying no value for its key.
    assertNonNullable(written);
  });
});
