import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";
import { simDynamoDbTableReads as reads } from "./sim-dynamodb-table-read.fixture.js";

describe("DynamoDB Select", () => {
  it.each(reads)(
    "counts without answering with items on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When the read asks only to be counted.
      const output = await read(simDynamoDb, { Select: "COUNT" });

      // Then the counts are there and the items are absent altogether, rather
      // than an empty list.
      assertIdentical(output.Count, 2);
      assertIdentical(output.ScannedCount, 2);
      assertUndefined(output.Items);
    },
  );

  it.each(reads)(
    "counts what a filter kept on $operation",
    async ({ read }) => {
      // Given a table holding a customer's open and shipped orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a counted read carries a filter.
      const output = await read(simDynamoDb, {
        Select: "COUNT",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": { S: "OPEN" } },
      });

      // Then Count is what survived the filter and ScannedCount what was read to
      // find it.
      assertIdentical(output.Count, 1);
      assertIdentical(output.ScannedCount, 2);
      assertUndefined(output.Items);
    },
  );

  it.each(reads)(
    "takes a Select of ALL_ATTRIBUTES on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When the read names the Select a table read already behaves as.
      const output = await read(simDynamoDb, { Select: "ALL_ATTRIBUTES" });

      // Then whole items are what it answers with.
      assertArrayLength(output.Items ?? [], 2);
    },
  );

  it.each(reads)(
    "refuses SPECIFIC_ATTRIBUTES with nothing to project on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a read asks for specific attributes and names none.
      const error = await assertThrowsErrorAsync(async () =>
        read(simDynamoDb, { Select: "SPECIFIC_ATTRIBUTES" }),
      );

      // Then it is refused, since there is nothing for it to answer with.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "ProjectionExpression");
    },
  );

  it.each(reads)(
    "refuses a projection alongside another Select on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a read asks to be counted and to project at the same time.
      const error = await assertThrowsErrorAsync(async () =>
        read(simDynamoDb, {
          Select: "COUNT",
          ProjectionExpression: "orderId",
        }),
      );

      // Then it is refused: SPECIFIC_ATTRIBUTES is the Select that projects.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "SPECIFIC_ATTRIBUTES");
    },
  );

  it.each(reads)(
    "refuses ALL_PROJECTED_ATTRIBUTES without an index on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a read asks for what an index projects and names no index.
      const error = await assertThrowsErrorAsync(async () =>
        read(simDynamoDb, { Select: "ALL_PROJECTED_ATTRIBUTES" }),
      );

      // Then it is refused, since a table read has no index to project from.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "IndexName");
    },
  );

  it.each(reads)(
    "refuses a Select that is not one on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a read asks for something Select does not take.
      const error = await assertThrowsErrorAsync(async () =>
        read(simDynamoDb, { Select: "EVERYTHING" }),
      );

      // Then it is refused naming what it could have said.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "ALL_ATTRIBUTES");
    },
  );

  it.each(reads)(
    "answers SPECIFIC_ATTRIBUTES with the projected attributes on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a read asks for specific attributes and names them.
      const output = await read(simDynamoDb, {
        Select: "SPECIFIC_ATTRIBUTES",
        ProjectionExpression: "orderId",
      });

      // Then every item carries the one attribute the projection named, and
      // the key it was found by is left out along with everything else.
      const items = output.Items ?? [];

      assertArrayLength(items, 2);
      assertObjectEquals(items[0], { orderId: { S: "2026-01" } });
      assertObjectEquals(items[1], { orderId: { S: "2026-02" } });
    },
  );

  it.each(reads)(
    "refuses SPECIFIC_ATTRIBUTES with AttributesToGet by name on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(
        { customerCount: 1, orderCount: 2 },
        simAws,
      );

      // When a read asks for specific attributes the legacy way.
      const error = await assertThrowsErrorAsync(async () =>
        read(simDynamoDb, {
          Select: "SPECIFIC_ATTRIBUTES",
          AttributesToGet: ["orderId"],
        }),
      );

      // Then AttributesToGet counts as the projection, so the refusal names it
      // rather than a ProjectionExpression the request never meant to write.
      assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
      assertStringIncludes(error.message, "AttributesToGet");
    },
  );
});
