import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimScanCommandInput } from "../../command/scan/scan.command.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";

/**
 * The orders these tests scan: three customers with two orders each, OPEN and
 * SHIPPED in turn, totalling 1 to 6.
 */
async function stockedOrders(): Promise<SimAws> {
  const simAws = new SimAws();
  await simDynamoDbStockedTableFactory.make(
    { customerCount: 3, orderCount: 2 },
    simAws,
  );

  return simAws;
}

/**
 * How many orders a legacy scan filter keeps.
 */
async function kept(
  simAws: SimAws,
  filter: Omit<SimScanCommandInput, "TableName">,
): Promise<number | undefined> {
  const output = await simAws
    .dynamoDb()
    .scan({ input: { TableName: "OrdersTable", ...filter } });

  return output.Count;
}

const n = (value: number): { N: string } => ({ N: value.toString() });

describe("DynamoDB legacy ScanFilter", () => {
  it.each([
    { operator: "EQ", attribute: "status", values: [{ S: "OPEN" }], count: 3 },
    { operator: "NE", attribute: "status", values: [{ S: "OPEN" }], count: 3 },
    { operator: "LE", attribute: "total", values: [n(2)], count: 2 },
    { operator: "LT", attribute: "total", values: [n(2)], count: 1 },
    { operator: "GE", attribute: "total", values: [n(5)], count: 2 },
    { operator: "GT", attribute: "total", values: [n(5)], count: 1 },
    { operator: "NOT_NULL", attribute: "status", values: [], count: 6 },
    { operator: "NULL", attribute: "note", values: [], count: 6 },
    { operator: "NULL", attribute: "status", values: [], count: 0 },
    {
      operator: "CONTAINS",
      attribute: "status",
      values: [{ S: "HIP" }],
      count: 3,
    },
    {
      operator: "NOT_CONTAINS",
      attribute: "status",
      values: [{ S: "HIP" }],
      count: 3,
    },
    {
      operator: "BEGINS_WITH",
      attribute: "status",
      values: [{ S: "OP" }],
      count: 3,
    },
    { operator: "IN", attribute: "total", values: [n(1), n(3)], count: 2 },
    { operator: "BETWEEN", attribute: "total", values: [n(2), n(4)], count: 3 },
  ])(
    "keeps the orders $operator keeps on $attribute",
    async ({ operator, attribute, values, count }) => {
      // Given a table of orders.
      const simAws = await stockedOrders();

      // When a scan filters with the operator.
      const found = await kept(simAws, {
        ScanFilter: {
          [attribute]: {
            ComparisonOperator: operator,
            AttributeValueList: values,
          },
        },
      });

      // Then it keeps the orders the expression it stands for keeps.
      assertIdentical(found, count);
    },
  );

  it("takes an IN longer than an expression's 100 values", async () => {
    // Given a table of orders.
    const simAws = await stockedOrders();

    // When a filter lists 150 totals.
    const found = await kept(simAws, {
      ScanFilter: {
        total: {
          ComparisonOperator: "IN",
          AttributeValueList: Array.from({ length: 150 }, (_, index) =>
            n(index + 1),
          ),
        },
      },
    });

    // Then every order matches one of them.
    assertIdentical(found, 6);
  });

  it.each([
    { joiner: "AND", count: 1 },
    { joiner: "OR", count: 4 },
  ])(
    "joins two conditions with ConditionalOperator $joiner",
    async ({ joiner, count }) => {
      // Given a table of orders.
      const simAws = await stockedOrders();

      // When a filter asks for open orders and orders over 4.
      const found = await kept(simAws, {
        ConditionalOperator: joiner,
        ScanFilter: {
          status: {
            ComparisonOperator: "EQ",
            AttributeValueList: [{ S: "OPEN" }],
          },
          total: { ComparisonOperator: "GT", AttributeValueList: [n(4)] },
        },
      });

      // Then the conditions are joined the way the operator says.
      assertIdentical(found, count);
    },
  );

  it.each([
    {
      refusal: "a set compared by LT",
      condition: {
        ComparisonOperator: "LT",
        AttributeValueList: [{ SS: ["a"] }],
      },
      message: "ComparisonOperator LT is not valid for SS AttributeValue type",
    },
    {
      refusal: "a number compared by BEGINS_WITH",
      condition: {
        ComparisonOperator: "BEGINS_WITH",
        AttributeValueList: [n(1)],
      },
      message: "ComparisonOperator BEGINS_WITH is not valid for N",
    },
    {
      refusal: "a Boolean compared by EQ",
      condition: {
        ComparisonOperator: "EQ",
        AttributeValueList: [{ BOOL: true }],
      },
      message:
        "ComparisonOperator EQ is not valid for BOOL AttributeValue type",
    },
    {
      refusal: "EQ with two values",
      condition: { ComparisonOperator: "EQ", AttributeValueList: [n(1), n(2)] },
      message: "Invalid number of argument(s) for the EQ ComparisonOperator",
    },
    {
      refusal: "NULL with a value",
      condition: { ComparisonOperator: "NULL", AttributeValueList: [n(1)] },
      message: "Invalid number of argument(s) for the NULL ComparisonOperator",
    },
    {
      refusal: "BETWEEN values of two types",
      condition: {
        ComparisonOperator: "BETWEEN",
        AttributeValueList: [n(1), { S: "9" }],
      },
      message: "must be of same type",
    },
    {
      refusal: "an operator AWS lacks",
      condition: { ComparisonOperator: "LIKE", AttributeValueList: [n(1)] },
      message: "ComparisonOperator 'LIKE' for total is not one of",
    },
  ])("refuses $refusal", async ({ condition, message }) => {
    // Given a table of orders.
    const simAws = await stockedOrders();

    // When a filter carries a comparison AWS refuses.
    const error = await assertThrowsErrorAsync(async () =>
      kept(simAws, { ScanFilter: { total: condition } }),
    );

    // Then it is refused for what the comparison said.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, message);
  });

  it("refuses a ConditionalOperator AWS lacks", async () => {
    // Given a table of orders.
    const simAws = await stockedOrders();

    // When a filter joins its conditions with XOR.
    const error = await assertThrowsErrorAsync(async () =>
      kept(simAws, {
        ConditionalOperator: "XOR",
        ScanFilter: { total: { ComparisonOperator: "NOT_NULL" } },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "'XOR' is not one of AND, OR");
  });
});
