import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimGetItemCommandOutput } from "./item.command.js";

/**
 * A table holding one order, with a nested map and a list in it.
 */
async function tableFor(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: {
        orderId: { S: "order-1" },
        status: { S: "shipped" },
        address: {
          M: {
            city: { S: "Leeds" },
            postcode: { S: "LS1 1AA" },
            country: { S: "UK" },
          },
        },
        lines: {
          L: [
            { M: { sku: { S: "a" }, quantity: { N: "1" } } },
            { M: { sku: { S: "b" }, quantity: { N: "2" } } },
            { M: { sku: { S: "c" }, quantity: { N: "3" } } },
          ],
        },
      },
    }),
  );

  return simDynamoDb;
}

/**
 * Read the one order back with a projection over it.
 */
async function projected(
  simDynamoDb: SimDynamoDb,
  expression: string,
  names?: Readonly<Record<string, string>>,
): Promise<SimGetItemCommandOutput["Item"]> {
  const output = await simDynamoDb.getItem({
    input: {
      TableName: "FooTable",
      Key: { orderId: { S: "order-1" } },
      ProjectionExpression: expression,
      ExpressionAttributeNames: names,
    },
  });

  return output.Item;
}

describe("DynamoDB GetItemCommand projection", () => {
  it("answers with only the paths the expression names", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is read with a projection naming a placeholder, a nested
    // attribute and one list element.
    const item = await projected(simDynamoDb, "#s, address.city, lines[0]", {
      "#s": "status",
    });

    // Then only those come back, and everything else is left out.
    assertNonNullable(item);
    assertArrayLength(Object.keys(item), 3);
    assertIdentical(item["status"]?.S, "shipped");
    assertUndefined(item["orderId"]);
  });

  it("keeps the nested shape of a projected map", async () => {
    // Given a table holding an order with a three attribute address.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When one attribute of the address is projected.
    const item = await projected(simDynamoDb, "address.city");

    // Then the address comes back as a map holding only that attribute,
    // rather than as the attribute on its own.
    const address = item?.["address"]?.M;
    assertNonNullable(address);
    assertArrayLength(Object.keys(address), 1);
    assertIdentical(address["city"]?.S, "Leeds");
  });

  it("merges two paths into the same map", async () => {
    // Given two projected paths reaching into one map.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When both are projected.
    const item = await projected(simDynamoDb, "address.city, address.country");

    // Then one map comes back holding both, rather than the second path
    // replacing the first.
    const address = item?.["address"]?.M;
    assertNonNullable(address);
    assertArrayLength(Object.keys(address), 2);
    assertIdentical(address["country"]?.S, "UK");
  });

  it("closes up a projected list", async () => {
    // Given a list of three elements with the first and last projected.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When both elements are projected.
    const item = await projected(simDynamoDb, "lines[0].sku, lines[2].sku");

    // Then a two element list comes back, in the order the list holds them,
    // rather than a three element list with a gap in the middle.
    const lines = item?.["lines"]?.L;
    assertNonNullable(lines);
    assertArrayLength(lines, 2);

    const first = lines.at(0)?.M;
    assertNonNullable(first);
    assertIdentical(first["sku"]?.S, "a");
    assertUndefined(first["quantity"]);
    assertIdentical(lines.at(1)?.M?.["sku"]?.S, "c");
  });

  it("merges two paths into the same list element", async () => {
    // Given two projected paths reaching into one element of a list.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When both are projected.
    const item = await projected(
      simDynamoDb,
      "lines[1].sku, lines[1].quantity",
    );

    // Then one element comes back holding both, rather than the same element
    // twice.
    const lines = item?.["lines"]?.L;
    assertNonNullable(lines);
    assertArrayLength(lines, 1);
    assertArrayLength(Object.keys(lines.at(0)?.M ?? {}), 2);
  });

  it("leaves out a list index past the end of the list", async () => {
    // Given a projection naming an element the list is too short to have.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is read.
    const item = await projected(simDynamoDb, "lines[9]");

    // Then the list is left out altogether, rather than coming back empty.
    assertNonNullable(item);
    assertUndefined(item["lines"]);
  });

  it("leaves out a path the item does not have", async () => {
    // Given a projection naming an attribute the item never carried.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is read.
    const item = await projected(
      simDynamoDb,
      "status, discount, address.county",
    );

    // Then the missing paths are simply absent, rather than an error or a NULL
    // standing in for them.
    assertNonNullable(item);
    assertArrayLength(Object.keys(item), 1);
    assertUndefined(item["discount"]);
    assertUndefined(item["address"]);
  });

  it("leaves out a path pointing into the wrong kind of value", async () => {
    // Given a projection reaching into a string as though it were a map, and
    // into a map as though it were a list.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is read.
    const item = await projected(simDynamoDb, "status.city, address[0]");

    // Then neither comes back: the item does not have what was asked for.
    assertNonNullable(item);
    assertArrayLength(Object.keys(item), 0);
  });

  it("answers with an empty item when the projection finds nothing", async () => {
    // Given a projection naming only attributes the item does not have.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is read.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        ProjectionExpression: "discount",
      }),
    );

    // Then there is an Item with nothing in it, rather than no Item: the key
    // was there, and nothing the request asked for was.
    assertNonNullable(output.Item);
    assertArrayLength(Object.keys(output.Item), 0);
  });

  it("answers with no item at all for a key holding nothing", async () => {
    // Given a projection over a key the table does not hold.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is read.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-2" } },
        ProjectionExpression: "status",
      }),
    );

    // Then there is no Item, which is how a caller tells a miss from an item
    // the projection found nothing in.
    assertUndefined(output.Item);
  });
});
