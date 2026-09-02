import {
  assertArrayLength,
  assertIdentical,
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
import { simDynamoDbTableReads as reads } from "./sim-dynamodb-table-read.fixture.js";

/**
 * One customer's two orders, which is enough for a page with more than one item
 * in it and few enough to write every attribute of both out.
 */
const oneCustomer = { customerCount: 1, orderCount: 2 };

describe("DynamoDB read projections", () => {
  it.each(reads)(
    "answers with the projected attributes alone on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(oneCustomer, simAws);

      // When a read names two of the four attributes an order carries.
      const output = await read(simDynamoDb, {
        ProjectionExpression: "orderId, #t",
        ExpressionAttributeNames: { "#t": "total" },
      });

      // Then those two come back and the rest stay behind, including the key
      // attributes the read found the items by. A projection used as an
      // allow-list is only worth writing if what it leaves out never arrives.
      const items = output.Items ?? [];

      assertArrayLength(items, 2);
      assertObjectEquals(items[0], {
        orderId: { S: "2026-01" },
        total: { N: "1" },
      });
      assertObjectEquals(items[1], {
        orderId: { S: "2026-02" },
        total: { N: "2" },
      });
    },
  );

  it.each(reads)(
    "keeps the nested shape of what it projects on $operation",
    async ({ read }) => {
      // Given a table holding one order with a map and a list in it.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbCollectionTableFactory.make({}, simAws);
      await simDynamoDb.putItem({
        input: {
          TableName: "OrdersTable",
          Item: {
            customerId: { S: "c-1" },
            orderId: { S: "2026-01" },
            address: { M: { city: { S: "Leeds" }, postcode: { S: "LS1" } } },
            lines: { L: [{ S: "first" }, { S: "second" }] },
          },
        },
      });

      // When a read names one attribute of the map and one place in the list.
      const output = await read(simDynamoDb, {
        ProjectionExpression: "address.city, lines[0]",
      });

      // Then the map and the list come back holding only what was named,
      // rather than flattened into the paths that named them.
      const items = output.Items ?? [];

      assertArrayLength(items, 1);
      assertObjectEquals(items[0], {
        address: { M: { city: { S: "Leeds" } } },
        lines: { L: [{ S: "first" }] },
      });
    },
  );

  it.each(reads)(
    "reads a filter and a projection off one set of placeholders on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders, one of them shipped.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(oneCustomer, simAws);

      // When a read filters by one attribute and projects another, with a
      // placeholder defined for each.
      const output = await read(simDynamoDb, {
        FilterExpression: "#s = :shipped",
        ProjectionExpression: "#t",
        ExpressionAttributeNames: { "#s": "status", "#t": "total" },
        ExpressionAttributeValues: { ":shipped": { S: "SHIPPED" } },
      });

      // Then both expressions were read, and neither placeholder counted as
      // unused because the other expression is the one using it.
      const items = output.Items ?? [];

      assertArrayLength(items, 1);
      assertObjectEquals(items[0], { total: { N: "2" } });
    },
  );

  it.each(reads)(
    "refuses a placeholder the projection and the filter both leave alone on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(oneCustomer, simAws);

      // When a read projects one attribute and defines a name for another.
      const error = await assertThrowsErrorAsync(async () =>
        read(simDynamoDb, {
          ProjectionExpression: "#t",
          ExpressionAttributeNames: { "#t": "total", "#s": "status" },
        }),
      );

      // Then the one no expression reached is refused by name, the way an
      // expression left half edited is caught on AWS.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "#s");
    },
  );

  it.each(reads)(
    "counts the items it read rather than the attributes on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(oneCustomer, simAws);

      // When a read projects one attribute of every item.
      const output = await read(simDynamoDb, {
        ProjectionExpression: "orderId",
      });

      // Then both counts are of items, and a projection cutting each item down
      // moves neither of them.
      assertIdentical(output.Count, 2);
      assertIdentical(output.ScannedCount, 2);
    },
  );

  it.each(reads)(
    "names the item it stopped on by its key, whatever it projected, on $operation",
    async ({ read }) => {
      // Given a table holding a customer's orders.
      const simAws = new SimAws();
      const simDynamoDb = simAws.dynamoDb();

      await simDynamoDbStockedTableFactory.make(oneCustomer, simAws);

      // When a read stops at a limit while projecting away the key.
      const output = await read(simDynamoDb, {
        Limit: 1,
        ProjectionExpression: "#t",
        ExpressionAttributeNames: { "#t": "total" },
      });

      // Then the item carries only what was projected, and the token still
      // carries the key. A token cut down to the projection would page no
      // further, which is the read that quietly stops early.
      const items = output.Items ?? [];

      assertArrayLength(items, 1);
      assertObjectEquals(items[0], { total: { N: "1" } });
      assertObjectEquals(output.LastEvaluatedKey ?? {}, {
        customerId: { S: "c-1" },
        orderId: { S: "2026-01" },
      });
    },
  );
});
