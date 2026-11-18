import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";

describe("DynamoDB ScanCommand input", () => {
  it("filters and projects with ScanFilter and AttributesToGet", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 2 },
      simAws,
    );

    // When a scan filters and projects the legacy way.
    const output = await simAws.dynamoDb().scan(
      new ScanCommand({
        TableName: "OrdersTable",
        ScanFilter: {
          status: {
            ComparisonOperator: "EQ",
            AttributeValueList: [{ S: "SHIPPED" }],
          },
        },
        AttributesToGet: ["orderId", "status"],
      }),
    );

    // Then it answers with the shipped order, cut down to what was asked for.
    const items = output.Items ?? [];
    assertArrayLength(items, 1);
    assertObjectEquals(items[0], {
      orderId: { S: "2026-02" },
      status: { S: "SHIPPED" },
    });
  });

  it("refuses a ScanFilter alongside a FilterExpression", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCollectionTableFactory.make({}, simAws);

    // When a scan mixes a legacy filter with an expression.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().scan({
        input: {
          TableName: "OrdersTable",
          ScanFilter: { status: { ComparisonOperator: "NOT_NULL" } },
          ProjectionExpression: "orderId",
        },
      }),
    );

    // Then it is refused, naming both, as AWS refuses it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Non-expression parameters: {ScanFilter} Expression parameters: " +
        "{ProjectionExpression}",
    );
  });

  it("takes a ReturnConsumedCapacity of NONE", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCollectionTableFactory.make({}, simAws);

    // When a scan asks for the capacity reporting it already does.
    const output = await simAws.dynamoDb().scan(
      new ScanCommand({
        TableName: "OrdersTable",
        ReturnConsumedCapacity: "NONE",
      }),
    );

    // Then it is let through.
    assertArrayEmpty(output.Items ?? []);
  });
});
