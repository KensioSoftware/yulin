import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * A table holding one order with an address nested inside it.
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
        status: { S: "packing" },
        address: {
          M: {
            city: { S: "Leeds" },
            postcode: { S: "LS1 1AA" },
            geo: { M: { lat: { N: "53.8" }, lon: { N: "-1.5" } } },
          },
        },
      },
    }),
  );

  return simDynamoDb;
}

/**
 * The item stored under the one key these tests use.
 */
async function storedOrder(
  simDynamoDb: SimDynamoDb,
): Promise<Readonly<Record<string, SimDynamoDbAttributeValue>>> {
  const output = await simDynamoDb.getItem(
    new GetItemCommand({
      TableName: "FooTable",
      Key: { orderId: { S: "order-1" } },
    }),
  );

  assertNonNullable(output.Item);

  return output.Item;
}

describe("DynamoDB UpdateItemCommand document paths", () => {
  it("writes into a map an item already carries", async () => {
    // Given an order carrying an address.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When one attribute inside the map is set and another removed.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET address.city = :city REMOVE address.postcode",
        ExpressionAttributeValues: { ":city": { S: "York" } },
      }),
    );

    // Then the map holds the new value, and the rest of the item is untouched.
    const stored = await storedOrder(simDynamoDb);
    const address = stored["address"]?.M;
    assertNonNullable(address);
    assertIdentical(address["city"]?.S, "York");
    assertUndefined(address["postcode"]);
    assertIdentical(stored["status"]?.S, "packing");
  });

  it("writes into a map inside a map", async () => {
    // Given an order whose address carries a location.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a path two levels down is written and its neighbour removed.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET address.geo.lat = :lat REMOVE address.geo.lon",
        ExpressionAttributeValues: { ":lat": { N: "54" } },
      }),
    );

    // Then only that far down changed, and everything around it is as it was.
    const stored = await storedOrder(simDynamoDb);
    const geo = stored["address"]?.M?.["geo"]?.M;
    assertNonNullable(geo);
    assertIdentical(geo["lat"]?.N, "54");
    assertUndefined(geo["lon"]);
    assertIdentical(stored["address"]?.M?.["city"]?.S, "Leeds");
  });

  it("leaves a removal reaching into something that is not a map alone", async () => {
    // Given an order whose status is a string.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a removal reaches inside that string.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "REMOVE #s.detail",
        ExpressionAttributeNames: { "#s": "status" },
      }),
    );

    // Then there was nothing there to remove, and the status is as it was.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["status"]?.S, "packing");
  });

  it("copies a value from one place in the item to another", async () => {
    // Given an order with an address on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an assignment reads a document path rather than a value.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET billingCity = address.city",
      }),
    );

    // Then the value was copied out of the map.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["billingCity"]?.S, "Leeds");
  });
});
