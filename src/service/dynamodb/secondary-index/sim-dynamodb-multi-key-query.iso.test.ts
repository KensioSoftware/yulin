import {
  assertArrayEquals,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimQueryCommandInput } from "../command/query/query.command.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { simDynamoDbMultiKeyTableFactory } from "./sim-dynamodb-multi-key-table.factory.js";

/**
 * The warehouse every default order sits in, as key condition placeholders.
 */
const warehouse = {
  ":region": { S: "north" },
  ":warehouse": { S: "w1" },
};

const inWarehouse = "#region = :region AND warehouse = :warehouse";

const statusName = { "#status": "status" };

/**
 * Keep the placeholders an expression uses. AWS refuses an unused one.
 */
function used<Value>(
  expression: string,
  placeholders: Readonly<Record<string, Value>>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(placeholders).filter(([key]) => expression.includes(key)),
  );
}

/**
 * Query the index, naming the warehouse and whatever else the test adds.
 */
async function query(
  simAws: SimAws,
  input: Partial<SimQueryCommandInput>,
): Promise<readonly string[]> {
  const expression = input.KeyConditionExpression ?? "";
  const page = await simAws.dynamoDb().query({
    input: {
      TableName: "OrdersTable",
      IndexName: "byWarehouse",
      ...input,
      ExpressionAttributeNames: used(expression, {
        "#region": "region",
        ...input.ExpressionAttributeNames,
      }),
      ExpressionAttributeValues: used(expression, {
        ...warehouse,
        ...input.ExpressionAttributeValues,
      }),
    },
  });

  return (page.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB Query on a multi-attribute index key", () => {
  it("orders a collection by each sort key attribute in turn", async () => {
    // Given orders sorted by status, then a numeric priority, then order id.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);

    // When the warehouse is read off the index.
    const ids = await query(simAws, { KeyConditionExpression: inWarehouse });

    // Then status decides first, a priority of 9 comes before 10, and order id
    // separates the two orders sharing both.
    assertArrayEquals(ids, [
      "order-3",
      "order-4",
      "order-2",
      "order-5",
      "order-1",
    ]);
  });

  it("reads the sort key from the left, ending in a range", async () => {
    // Given the orders.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);

    // When the first sort key attribute is fixed and the second is a range.
    const ids = await query(simAws, {
      KeyConditionExpression: `${inWarehouse} AND #status = :status AND priority < :priority`,
      ExpressionAttributeNames: statusName,
      ExpressionAttributeValues: {
        ":status": { S: "OPEN" },
        ":priority": { N: "10" },
      },
      ScanIndexForward: false,
    });

    // Then the open orders under 10 come back, walked backwards.
    assertArrayEquals(ids, ["order-4", "order-3"]);
  });

  it("takes a prefix on the first sort key attribute", async () => {
    // Given the orders.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);

    // When the query asks for statuses starting with P or later.
    const ids = await query(simAws, {
      KeyConditionExpression: `${inWarehouse} AND begins_with(#status, :p)`,
      ExpressionAttributeNames: statusName,
      ExpressionAttributeValues: { ":p": { S: "P" } },
    });

    // Then only the packed order comes back.
    assertArrayEquals(ids, ["order-5"]);
  });

  it("fixes every sort key attribute at once", async () => {
    // Given the orders.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);

    // When all three sort key attributes are held equal, in any written order.
    const ids = await query(simAws, {
      KeyConditionExpression:
        `orderId = :id AND priority = :priority AND ${inWarehouse} AND ` +
        `#status = :status`,
      ExpressionAttributeNames: statusName,
      ExpressionAttributeValues: {
        ":status": { S: "OPEN" },
        ":priority": { N: "9" },
        ":id": { S: "order-4" },
      },
    });

    // Then the one order matching them comes back.
    assertArrayEquals(ids, ["order-4"]);
  });

  it("leaves out an order missing one of the index key attributes", async () => {
    // Given an order with no warehouse alongside one with every attribute.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make(
      {
        orders: [
          {
            orderId: { S: "order-1" },
            region: { S: "north" },
            warehouse: { S: "w1" },
            status: { S: "OPEN" },
            priority: { N: "1" },
          },
          {
            orderId: { S: "order-2" },
            region: { S: "north" },
            status: { S: "OPEN" },
            priority: { N: "1" },
          },
        ],
      },
      simAws,
    );

    // When the warehouse is read off the index.
    const ids = await query(simAws, { KeyConditionExpression: inWarehouse });

    // Then the order missing part of the key is absent from the index.
    assertArrayEquals(ids, ["order-1"]);
  });

  it("resumes a walk from a token carrying every key attribute", async () => {
    // Given the orders.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);
    const dynamoDb = simAws.dynamoDb();
    const input = {
      TableName: "OrdersTable",
      IndexName: "byWarehouse",
      KeyConditionExpression: inWarehouse,
      ExpressionAttributeNames: { "#region": "region" },
      ExpressionAttributeValues: warehouse,
      Limit: 2,
    };

    // When the first page is read and the walk resumed from its token.
    const first = await dynamoDb.query({ input });
    const second = await dynamoDb.query({
      input: { ...input, ExclusiveStartKey: first.LastEvaluatedKey },
    });

    // Then the token names every index key attribute and the table key, and
    // the next page carries on from it.
    assertObjectEquals(first.LastEvaluatedKey, {
      region: { S: "north" },
      warehouse: { S: "w1" },
      status: { S: "OPEN" },
      priority: { N: "9" },
      orderId: { S: "order-4" },
    });
    assertArrayEquals(
      (second.Items ?? []).map((item) => item["orderId"]?.S),
      ["order-2", "order-5"],
    );
  });

  it.each([
    {
      refusal: "a partition key attribute left out",
      input: {
        KeyConditionExpression: "#region = :region",
      },
      message: "does not name the partition key warehouse",
    },
    {
      refusal: "a range on a partition key attribute",
      input: {
        KeyConditionExpression: "#region = :region AND warehouse > :warehouse",
      },
      message: "the partition key warehouse takes only =",
    },
    {
      refusal: "a sort key attribute skipped",
      input: {
        KeyConditionExpression: `${inWarehouse} AND priority = :priority`,
        ExpressionAttributeValues: { ":priority": { N: "9" } },
      },
      message:
        "Query key condition not supported: priority is tested and status " +
        "before it is skipped",
    },
    {
      refusal: "a sort key attribute tested after a range",
      input: {
        KeyConditionExpression: `${inWarehouse} AND #status > :status AND priority = :priority`,
        ExpressionAttributeNames: statusName,
        ExpressionAttributeValues: {
          ":status": { S: "OPEN" },
          ":priority": { N: "9" },
        },
      },
      message:
        "Query key condition not supported: status is tested with >, so no " +
        "sort key attribute after it can be tested",
    },
    {
      refusal: "a skipped attribute before checking the value type",
      input: {
        KeyConditionExpression: `${inWarehouse} AND priority = :priority`,
        ExpressionAttributeValues: { ":priority": { S: "high" } },
      },
      message: "Query key condition not supported",
    },
  ])("refuses $refusal", async ({ input, message }) => {
    // Given the orders.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);

    // When the index is queried with a key condition AWS refuses.
    const error = await assertThrowsErrorAsync(async () =>
      query(simAws, input),
    );

    // Then it is refused for what it got wrong.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, message);
  });

  it("reports the key schema as it was declared", async () => {
    // Given the table.
    const simAws = new SimAws();
    await simDynamoDbMultiKeyTableFactory.make({}, simAws);

    // When it is described.
    const described = await simAws
      .dynamoDb()
      .describeTable({ input: { TableName: "OrdersTable" } });

    // Then the index lists every key attribute, partition key first.
    const index = described.Table?.GlobalSecondaryIndexes?.at(0);
    assertArrayEquals(
      (index?.KeySchema ?? []).map(
        (element) => `${element.KeyType} ${element.AttributeName}`,
      ),
      [
        "HASH region",
        "HASH warehouse",
        "RANGE status",
        "RANGE priority",
        "RANGE orderId",
      ],
    );
    assertUndefined(described.Table?.LocalSecondaryIndexes);
  });
});
