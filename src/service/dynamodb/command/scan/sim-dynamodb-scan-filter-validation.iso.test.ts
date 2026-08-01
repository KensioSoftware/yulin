import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";

describe("DynamoDB ScanCommand FilterExpression validation", () => {
  it.each([
    {
      parameter: "ExpressionAttributeNames",
      input: { ExpressionAttributeNames: { "#status": "status" } },
    },
    {
      parameter: "ExpressionAttributeValues",
      input: { ExpressionAttributeValues: { ":open": { S: "OPEN" } } },
    },
  ])("refuses $parameter with no filter to use them", async (example) => {
    // Given a table keyed by customer and order. A filter is read before the
    // table is, so there is nothing to write to it.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCollectionTableFactory.make({}, simAws);

    // When a scan defines placeholders and carries no expression.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", ...example.input }),
      ),
    );

    // Then it is refused by name, since nothing would ever read them.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, example.parameter);
  });

  it.each([
    { name: "an empty expression", filter: " " },
    { name: "a syntax error", filter: "#status =" },
    { name: "an undefined placeholder", filter: "#missing = :open" },
  ])("refuses $name in a scan filter", async (example) => {
    // Given a table keyed by customer and order. A filter is read before the
    // table is, so there is nothing to write to it.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbCollectionTableFactory.make({}, simAws);

    // When a scan carries a filter DynamoDB would not read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({
          TableName: "OrdersTable",
          FilterExpression: example.filter,
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":open": { S: "OPEN" } },
        }),
      ),
    );

    // Then it is refused rather than read as something else.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });
});
