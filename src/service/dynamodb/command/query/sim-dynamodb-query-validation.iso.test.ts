import { QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table keyed by customer and order, with no items in it.
 *
 * A key condition is refused for what it says rather than for what it finds, so
 * nothing has to be written for these.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  return simDynamoDb;
}

/**
 * A value for every placeholder an expression uses.
 *
 * The placeholders and the expression have to agree in both directions, so
 * supplying exactly what each expression names is what keeps these refusals
 * about what the key condition says rather than about a value that was missing
 * or spare.
 */
function valuesFor(expression: string): Record<string, { S: string }> {
  const placeholders = expression.match(/:\w+/g) ?? [];

  return Object.fromEntries(
    placeholders.map((placeholder) => [placeholder, { S: "value" }]),
  );
}

/**
 * Read a collection with a key condition, and answer with what it was refused
 * for.
 */
async function refusalFor(
  keyConditionExpression: string,
): Promise<SimDynamoDbValidationException> {
  const simAws = new SimAws();
  const simDynamoDb = await ordersTable(simAws);

  const error = await assertThrowsErrorAsync(async () =>
    simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: valuesFor(keyConditionExpression),
      }),
    ),
  );

  assertInstanceOf(error, SimDynamoDbValidationException);

  return error;
}

describe("DynamoDB QueryCommand key condition validation", () => {
  it("requires a KeyConditionExpression", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query names no key condition at all.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(new QueryCommand({ TableName: "OrdersTable" })),
    );

    // Then it is refused: a query reads one item collection, and nothing says
    // which.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "A KeyConditionExpression is required");
  });

  it("refuses a key condition that does not name the partition key", async () => {
    // When only the sort key is tested.
    const error = await refusalFor("orderId = :order");

    // Then it is refused, naming the partition key it wanted.
    assertStringIncludes(error.message, "does not name the partition key");
    assertStringIncludes(error.message, "customerId");
  });

  it.each([
    "customerId > :customer",
    "customerId BETWEEN :customer AND :order",
  ])(
    "refuses a range operator on the partition key in '%s'",
    async (keyCondition) => {
      // When the partition key is given a range rather than an equality.
      const error = await refusalFor(keyCondition);

      // Then it is refused: a query reads one item collection rather than a
      // range of them.
      assertStringIncludes(error.message, "takes only =");
    },
  );

  it("refuses begins_with on the partition key", async () => {
    // When the partition key is given a prefix.
    const error = await refusalFor("begins_with(customerId, :customer)");

    // Then it is refused the same way any other range on it is.
    assertStringIncludes(error.message, "takes only =");
  });

  it("refuses a key condition naming an attribute outside the key", async () => {
    // When an ordinary attribute is tested alongside the partition key.
    const error = await refusalFor(
      "customerId = :customer AND status = :other",
    );

    // Then it is refused rather than filtered by, which is what
    // FilterExpression is for.
    assertStringIncludes(error.message, "status is not part of the table's");
  });

  it.each(["OR", "or"])("refuses %s in a key condition", async (word) => {
    // When two key conditions are joined by OR.
    const error = await refusalFor(
      `customerId = :customer ${word} orderId = :order`,
    );

    // Then it is refused: a key condition joins its two terms with AND only.
    assertStringIncludes(error.message, "OR is not part of a key condition");
  });

  it("refuses NOT in a key condition", async () => {
    // When a key condition is negated.
    const error = await refusalFor("NOT customerId = :customer");

    // Then it is refused.
    assertStringIncludes(error.message, "NOT is not part of a key condition");
  });

  it("refuses an unsupported operator on the sort key", async () => {
    // When the sort key is tested for inequality.
    const error = await refusalFor(
      "customerId = :customer AND orderId <> :order",
    );

    // Then it is refused: a query reads a contiguous run of the sort key.
    assertStringIncludes(error.message, "is not a key condition operator");
  });

  it("refuses a function a key condition does not take", async () => {
    // When the sort key is tested with a condition expression function.
    const error = await refusalFor(
      "customerId = :customer AND contains(orderId, :order)",
    );

    // Then it is refused, naming the one function a sort key condition uses.
    assertStringIncludes(error.message, "is not a key condition function");
    assertStringIncludes(error.message, "begins_with");
  });

  it("refuses a bracketed key condition", async () => {
    // When a term is bracketed.
    const error = await refusalFor("(customerId = :customer)");

    // Then it is refused. This is stricter than real DynamoDB, and is recorded
    // under Limitations in the usage docs.
    assertStringIncludes(error.message, "takes no brackets");
  });

  it("refuses a key condition naming the same attribute twice", async () => {
    // When the partition key is tested twice.
    const error = await refusalFor(
      "customerId = :customer AND customerId = :customer",
    );

    // Then it is refused.
    assertStringIncludes(error.message, "more than once");
  });

  it("refuses a document path in a key condition", async () => {
    // When a key condition dereferences the attribute it names.
    const error = await refusalFor("customerId.city = :customer");

    // Then it is refused: a key is scalar and cannot be nested.
    assertStringIncludes(error.message, "top-level attribute");
  });

  it("refuses a key condition comparing against a literal", async () => {
    // When a value is written into the expression rather than supplied.
    const error = await refusalFor("customerId = 5");

    // Then it is refused: key conditions have no literals.
    assertStringIncludes(error.message, "ExpressionAttributeValues");
  });

  it("refuses a key condition starting with something that is not a name", async () => {
    // When a term starts with a value placeholder.
    const error = await refusalFor(":customer = customerId");

    // Then it is refused, naming what was expected.
    assertStringIncludes(error.message, "a key attribute name was expected");
  });

  it("refuses an empty KeyConditionExpression", async () => {
    // When the expression says nothing.
    const error = await refusalFor(" ".repeat(3));

    // Then it is refused.
    assertStringIncludes(error.message, "the expression says nothing");
  });

  it("refuses anything left over after a complete key condition", async () => {
    // When a third term follows without an AND.
    const error = await refusalFor("customerId = :customer orderId = :order");

    // Then it is refused.
    assertStringIncludes(error.message, "follows a complete key condition");
  });

  it("refuses a placeholder the request does not define", async () => {
    // When a key condition uses a value the request never supplied.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "OrdersTable",
          KeyConditionExpression: "customerId = :missing",
          ExpressionAttributeValues: { ":customer": { S: "c-1" } },
        }),
      ),
    );

    // Then it is refused, naming the placeholder.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, ":missing");
  });

  it("refuses a supplied value no key condition used", async () => {
    // When the request supplies a value the expression never names.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "OrdersTable",
          KeyConditionExpression: "customerId = :customer",
          ExpressionAttributeValues: {
            ":customer": { S: "c-1" },
            ":spare": { S: "unused" },
          },
        }),
      ),
    );

    // Then it is refused, which is what a request hits after an expression is
    // edited and the old placeholder is left behind.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, ":spare");
  });

  it.each([
    { name: "Segment", input: { Segment: 0 } },
    { name: "TotalSegments", input: { TotalSegments: 4 } },
    { name: "both", input: { Segment: 0, TotalSegments: 4 } },
  ])(
    "refuses a Query dividing itself into segments, given $name",
    async (example) => {
      // Given a table.
      const simAws = new SimAws();
      const simDynamoDb = await ordersTable(simAws);

      // When a query carries the parallel scan parameters.
      const error = await assertThrowsErrorAsync(async () =>
        simDynamoDb.query({
          input: {
            TableName: "OrdersTable",
            KeyConditionExpression: "customerId = :customer",
            ExpressionAttributeValues: { ":customer": { S: "c-1" } },
            ...example.input,
          },
        }),
      );

      // Then it is refused. Segment and TotalSegments divide a Scan, and a query
      // reads one item collection, which sits inside one segment.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "Scan");
    },
  );
});
