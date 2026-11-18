import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimPutItemCommandInput } from "../../command/item/item.command.js";
import {
  SimDynamoDbConditionalCheckFailedException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * A table holding one open order, totalling 10.
 */
async function openOrder(): Promise<SimAws> {
  const simAws = new SimAws();
  await simDynamoDbCreatedTableFactory.make({}, simAws);
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "FoobarTable",
      Item: { id: { S: "order-1" }, status: { S: "OPEN" }, total: { N: "10" } },
    }),
  );

  return simAws;
}

/**
 * Replace the order with a shipped one, guarded the way the test asks.
 */
async function shipOrder(
  simAws: SimAws,
  guard: Pick<SimPutItemCommandInput, "Expected" | "ConditionalOperator">,
): Promise<void> {
  await simAws.dynamoDb().putItem({
    input: {
      TableName: "FoobarTable",
      Item: { id: { S: "order-1" }, status: { S: "SHIPPED" } },
      ...guard,
    },
  });
}

/**
 * The status the order holds now.
 */
async function statusOf(simAws: SimAws): Promise<string | undefined> {
  const read = await simAws.dynamoDb().getItem({
    input: { TableName: "FoobarTable", Key: { id: { S: "order-1" } } },
  });

  return read.Item?.["status"]?.S;
}

describe("DynamoDB legacy Expected", () => {
  it.each([
    {
      expectation: "a Value it holds",
      guard: { Expected: { status: { Value: { S: "OPEN" } } } },
    },
    {
      expectation: "Exists with a Value it holds",
      guard: { Expected: { status: { Exists: true, Value: { S: "OPEN" } } } },
    },
    {
      expectation: "an attribute it lacks to be absent",
      guard: { Expected: { note: { Exists: false } } },
    },
    {
      expectation: "a comparison it passes",
      guard: {
        Expected: {
          total: {
            ComparisonOperator: "GE",
            AttributeValueList: [{ N: "10" }],
          },
        },
      },
    },
    {
      expectation: "either of two, joined by OR",
      guard: {
        ConditionalOperator: "OR",
        Expected: {
          status: { Value: { S: "SHIPPED" } },
          total: { ComparisonOperator: "NOT_NULL" },
        },
      },
    },
  ])("writes when the order meets $expectation", async ({ guard }) => {
    // Given an open order.
    const simAws = await openOrder();

    // When the order is replaced, guarded by what it meets.
    await shipOrder(simAws, guard);

    // Then the write goes through.
    assertIdentical(await statusOf(simAws), "SHIPPED");
  });

  it.each([
    {
      expectation: "a Value it lacks",
      guard: { Expected: { status: { Value: { S: "SHIPPED" } } } },
    },
    {
      expectation: "an attribute it holds to be absent",
      guard: { Expected: { status: { Exists: false } } },
    },
    {
      expectation: "both of two, one of which it fails",
      guard: {
        Expected: {
          status: { Value: { S: "OPEN" } },
          total: {
            ComparisonOperator: "GT",
            AttributeValueList: [{ N: "10" }],
          },
        },
      },
    },
  ])(
    "refuses the write when the order fails $expectation",
    async ({ guard }) => {
      // Given an open order.
      const simAws = await openOrder();

      // When the order is replaced, guarded by what it fails.
      const error = await assertThrowsErrorAsync(async () =>
        shipOrder(simAws, guard),
      );

      // Then the condition fails and the order is as it was.
      assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
      assertIdentical(await statusOf(simAws), "OPEN");
    },
  );

  it.each([
    {
      refusal: "a Value expected to be absent",
      guard: { Expected: { status: { Exists: false, Value: { S: "OPEN" } } } },
      message: "Cannot expect an attribute to have a specified value",
    },
    {
      refusal: "Exists with no Value",
      guard: { Expected: { status: { Exists: true } } },
      message: "Exists is set to TRUE for attribute (status)",
    },
    {
      refusal: "a Value with a ComparisonOperator",
      guard: {
        Expected: {
          status: { Value: { S: "OPEN" }, ComparisonOperator: "NOT_NULL" },
        },
      },
      message: "Value and Exists cannot be used with ComparisonOperator",
    },
  ])("refuses $refusal", async ({ guard, message }) => {
    // Given an open order.
    const simAws = await openOrder();

    // When the expectation is one AWS refuses.
    const error = await assertThrowsErrorAsync(async () =>
      shipOrder(simAws, guard),
    );

    // Then it is refused for what it said.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, message);
  });

  it("refuses Expected alongside a ConditionExpression", async () => {
    // Given an open order.
    const simAws = await openOrder();

    // When a write mixes the two.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().putItem({
        input: {
          TableName: "FoobarTable",
          Item: { id: { S: "order-1" } },
          Expected: { status: { Exists: false } },
          ConditionExpression: "attribute_exists(id)",
        },
      }),
    );

    // Then it is refused, naming both.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Non-expression parameters: {Expected} Expression parameters: " +
        "{ConditionExpression}",
    );
  });
});
