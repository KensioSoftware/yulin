import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const tableName = "OrdersTable";

/**
 * The item actions a fine-grained access control policy names.
 */
const scopedActions = [
  "dynamodb:GetItem",
  "dynamodb:BatchGetItem",
  "dynamodb:Query",
  "dynamodb:Scan",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:BatchWriteItem",
];

/**
 * A table keyed by a customer and an order, holding one item.
 */
async function stockedTable(simAws: SimAws): Promise<void> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable({
    input: {
      TableName: tableName,
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

  await simDynamoDb.putItem({
    input: {
      TableName: tableName,
      Item: {
        customerId: { S: "c-1" },
        orderId: { S: "2026-01" },
        status: { S: "PLACED" },
        address: { M: { city: { S: "Leeds" } } },
        secret: { S: "hidden" },
      },
    },
  });
}

/**
 * A caller allowed the item actions on the table, for named attributes only.
 *
 * This is the attribute-level access control policy the DynamoDB developer
 * guide writes, with the key attributes named alongside the ones being read.
 */
async function callerAllowed(
  simAws: SimAws,
  attributes: readonly string[],
): Promise<SimAwsCaller> {
  const simIam = simAws.iam();
  const roleName = "OrdersRole";
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
      PolicyName: "NamedAttributesOnly",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: scopedActions,
          Resource: `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/${tableName}`,
          Condition: {
            "ForAllValues:StringEquals": { "dynamodb:Attributes": attributes },
          },
        },
      }),
    },
  });

  return { kind: "arn", arn: creation.Role.Arn };
}

const keyAttributes = ["customerId", "orderId"];

/**
 * One request against the table, naming `status` and nothing else beyond its
 * key.
 */
const requests = {
  "dynamodb:GetItem": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().getItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: "c-1" }, orderId: { S: "2026-01" } },
          ProjectionExpression: "#s",
          ExpressionAttributeNames: { "#s": "status" },
        },
      },
      { caller },
    ),

  "dynamodb:BatchGetItem": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().batchGetItem(
      {
        input: {
          RequestItems: {
            [tableName]: {
              Keys: [{ customerId: { S: "c-1" }, orderId: { S: "2026-01" } }],
              ProjectionExpression: "#s",
              ExpressionAttributeNames: { "#s": "status" },
            },
          },
        },
      },
      { caller },
    ),

  "dynamodb:Query": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().query(
      {
        input: {
          TableName: tableName,
          KeyConditionExpression: "customerId = :customerId",
          ProjectionExpression: "#s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":customerId": { S: "c-1" } },
        },
      },
      { caller },
    ),

  "dynamodb:Scan": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().scan(
      {
        input: {
          TableName: tableName,
          ProjectionExpression: "#s",
          ExpressionAttributeNames: { "#s": "status" },
        },
      },
      { caller },
    ),

  "dynamodb:PutItem": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().putItem(
      {
        input: {
          TableName: tableName,
          Item: {
            customerId: { S: "c-1" },
            orderId: { S: "2026-02" },
            status: { S: "PLACED" },
          },
        },
      },
      { caller },
    ),

  "dynamodb:UpdateItem": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().updateItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: "c-1" }, orderId: { S: "2026-01" } },
          UpdateExpression: "SET #s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": { S: "PAID" } },
        },
      },
      { caller },
    ),

  "dynamodb:DeleteItem": async (
    simAws: SimAws,
    caller: SimAwsCaller,
  ): Promise<unknown> =>
    simAws.dynamoDb().deleteItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: "c-1" }, orderId: { S: "2026-01" } },
          ConditionExpression: "#s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": { S: "PLACED" } },
        },
      },
      { caller },
    ),

  "dynamodb:BatchWriteItem": async (
    simAws: SimAws,
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
                    orderId: { S: "2026-03" },
                    status: { S: "PLACED" },
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

describe("DynamoDB dynamodb:Attributes authorization", () => {
  it.each(scopedActions)(
    "allows %s naming only attributes the policy names",
    async (action) => {
      // Given a caller allowed the key attributes and `status`.
      const simAws = new SimAws();
      await stockedTable(simAws);
      const caller = await callerAllowed(simAws, [...keyAttributes, "status"]);

      // When it makes a request naming those and nothing else.
      const answer = await requests[action as keyof typeof requests](
        simAws,
        caller,
      );

      // Then the condition holds and the request is answered.
      assertNonNullable(answer);
    },
  );

  it.each(scopedActions)(
    "refuses %s naming an attribute the policy leaves out",
    async (action) => {
      // Given a caller allowed the key attributes and one other attribute,
      // which is not the one the requests name.
      const simAws = new SimAws();
      await stockedTable(simAws);
      const caller = await callerAllowed(simAws, [...keyAttributes, "total"]);

      // When it makes the same request, which names `status`.
      const error = await assertThrowsErrorAsync(async () =>
        requests[action as keyof typeof requests](simAws, caller),
      );

      // Then the condition fails and the whole request is refused.
      assertInstanceOf(error, SimIamAccessDenied);
    },
  );

  it("counts a nested path as the attribute it starts at", async () => {
    // Given a caller allowed the key attributes and `address`, where the
    // request reaches a field inside that map. AWS counts a top-level
    // attribute as named where anything nested inside it is.
    const simAws = new SimAws();
    await stockedTable(simAws);
    const caller = await callerAllowed(simAws, [...keyAttributes, "address"]);

    // When it projects the nested path.
    const answer = await simAws.dynamoDb().getItem(
      {
        input: {
          TableName: tableName,
          Key: { customerId: { S: "c-1" }, orderId: { S: "2026-01" } },
          ProjectionExpression: "address.city",
        },
      },
      { caller },
    );

    // Then `address` is what the condition matched, and `city` never reached
    // it as an attribute of its own.
    assertNonNullable(answer.Item);
  });

  it("refuses a request naming the key attributes the policy leaves out", async () => {
    // Given a caller allowed `status` alone. AWS requires a policy using
    // `dynamodb:Attributes` to name every primary key attribute of the table,
    // since DynamoDB needs them to perform the action.
    const simAws = new SimAws();
    await stockedTable(simAws);
    const caller = await callerAllowed(simAws, ["status"]);

    // When it reads an item, which names its key.
    const error = await assertThrowsErrorAsync(async () =>
      requests["dynamodb:GetItem"](simAws, caller),
    );

    // Then the key attributes fail the condition.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("names no attributes for a request carrying no expression or key", async () => {
    // Given a caller allowed nothing but `total`, and a scan naming no
    // expression at all.
    const simAws = new SimAws();
    await stockedTable(simAws);
    const caller = await callerAllowed(simAws, ["total"]);

    // When it scans the whole table.
    const answer = await simAws
      .dynamoDb()
      .scan({ input: { TableName: tableName } }, { caller });

    // Then the key is absent from the condition context, and a `ForAllValues`
    // condition matches a request carrying no value for it. This is the
    // over-permissive case AWS warns about, and a `Null` guard is what closes
    // it.
    assertNonNullable(answer.Items);
  });
});
