import { ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimScanCommandOutput } from "../command/scan/scan.command.js";
import { simDynamoDbCreatedTableFactory } from "../table/sim-dynamodb-created-table.factory.js";

/**
 * A filter of `count` comparisons joined by `OR`, which is `2 * count - 1`
 * operators.
 */
function comparisons(count: number): string {
  return Array.from({ length: count }, () => "a = :v").join(" OR ");
}

/**
 * Scan an empty table with the filter and placeholders given.
 */
async function scanWith(
  simAws: SimAws,
  input: Omit<ConstructorParameters<typeof ScanCommand>[0], "TableName">,
): Promise<SimScanCommandOutput> {
  return await simAws
    .dynamoDb()
    .scan(new ScanCommand({ TableName: "FoobarTable", ...input }));
}

describe("DynamoDB expression limits", () => {
  it("evaluates an expression of exactly 4 KB", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a filter is 4096 bytes long.
    const name = "a".repeat(4096 - "attribute_exists()".length);
    const output = await scanWith(simAws, {
      FilterExpression: `attribute_exists(${name})`,
    });

    // Then it is read.
    assertIdentical(output.Count, 0);
  });

  it("refuses an expression over 4 KB", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a filter is one byte longer.
    const name = "a".repeat(4097 - "attribute_exists()".length);
    const error = await assertThrowsErrorAsync(async () =>
      scanWith(simAws, { FilterExpression: `attribute_exists(${name})` }),
    );

    // Then it is refused for its size.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Invalid FilterExpression: Expression size has exceeded the maximum " +
        "allowed size; expression size: 4097",
    );
  });

  it("evaluates an expression of 300 operators", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a filter holds 150 comparisons, 149 ORs and one NOT.
    const output = await scanWith(simAws, {
      FilterExpression: `NOT ${comparisons(150)}`,
      ExpressionAttributeValues: { ":v": { S: "x" } },
    });

    // Then it is read.
    assertIdentical(output.Count, 0);
  });

  it("refuses an expression of 301 operators", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a filter holds 151 comparisons and 150 ORs.
    const error = await assertThrowsErrorAsync(async () =>
      scanWith(simAws, {
        FilterExpression: comparisons(151),
        ExpressionAttributeValues: { ":v": { S: "x" } },
      }),
    );

    // Then it is refused, reporting 301 as AWS does.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The expression contains too many operators; operator count: 301",
    );
  });

  it("counts no operator for the = of a SET action", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When an update sets 301 attributes.
    const actions = Array.from(
      { length: 301 },
      (_, index) => `a${index.toString()}=:v`,
    );
    const output = await simAws.dynamoDb().updateItem(
      new UpdateItemCommand({
        TableName: "FoobarTable",
        Key: { id: { S: "item-1" } },
        UpdateExpression: `SET ${actions.join(",")}`,
        ExpressionAttributeValues: { ":v": { N: "1" } },
        ReturnValues: "UPDATED_NEW",
      }),
    );

    // Then every one of them is applied.
    assertArrayLength(Object.keys(output.Attributes ?? {}), 301);
  });

  it("counts the arithmetic of an update", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When an update adds to 301 attributes.
    const actions = Array.from({ length: 301 }, (_, index) => {
      const name = `a${index.toString()}`;

      return `${name}=${name}+:v`;
    });
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().updateItem({
        input: {
          TableName: "FoobarTable",
          Key: { id: { S: "item-1" } },
          UpdateExpression: `SET ${actions.join(",")}`,
          ExpressionAttributeValues: { ":v": { N: "1" } },
        },
      }),
    );

    // Then it is refused for its operators.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Invalid UpdateExpression");
    assertStringIncludes(error.message, "operator count: 301");
  });

  it("refuses a placeholder over 255 bytes", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a filter names an attribute through a 256 byte placeholder.
    const placeholder = `#${"n".repeat(255)}`;
    const error = await assertThrowsErrorAsync(async () =>
      scanWith(simAws, {
        FilterExpression: `attribute_exists(${placeholder})`,
        ExpressionAttributeNames: { [placeholder]: "status" },
      }),
    );

    // Then it is refused for its length.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ExpressionAttributeNames contains a key of 256 bytes",
    );
  });

  it("refuses an expression that is not a string", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a request built without the SDK's types carries a number.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().scan({
        input: { TableName: "FoobarTable", FilterExpression: 42 as never },
      }),
    );

    // Then it is refused as invalid input.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Invalid FilterExpression");
  });

  it("refuses a placeholder standing for something other than a name", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a request built without the SDK's types maps a name to null.
    const error = await assertThrowsErrorAsync(async () =>
      scanWith(simAws, {
        FilterExpression: "attribute_exists(a)",
        ExpressionAttributeNames: { "#spare": null as never },
      }),
    );

    // Then it is refused as invalid input.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "ExpressionAttributeNames maps #spare");
  });

  it("refuses placeholders over 2 MB between them", async () => {
    // Given a table.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When a filter compares against six values of 350,000 bytes each.
    const large = { S: "x".repeat(350_000) };
    const placeholders = ["v0", "v1", "v2", "v3", "v4", "v5"].map(
      (name) => `:${name}`,
    );
    const error = await assertThrowsErrorAsync(async () =>
      scanWith(simAws, {
        FilterExpression: `a IN (${placeholders.join(", ")})`,
        ExpressionAttributeValues: Object.fromEntries(
          placeholders.map((placeholder) => [placeholder, large]),
        ),
      }),
    );

    // Then it is refused for their size.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "at most 2 MB");
  });
});
