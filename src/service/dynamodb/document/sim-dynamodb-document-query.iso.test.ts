import {
  CreateTableCommand,
  DynamoDBClient,
  QueryCommand as ClientQueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateQuery,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

/**
 * The orders these tests read, one customer having more than one.
 */
const orders: readonly Record<string, unknown>[] = [
  { customerId: "cust-1", orderId: "order-1", total: 42, paid: true },
  { customerId: "cust-1", orderId: "order-2", total: 7, paid: false },
  { customerId: "cust-2", orderId: "order-3", total: 19, paid: true },
];

/**
 * An intercepted document client, and a table holding the orders above.
 *
 * The table is created and filled through the same document client, which is
 * what a test using the document client would do.
 */
async function interceptedOrders(
  simSdk: SimSdk,
): Promise<DynamoDBDocumentClient> {
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "eu-west-2" }),
  );
  simSdk.intercept(documents);

  await documents.send(
    new CreateTableCommand({
      TableName: "OrdersTable",
      KeySchema: [
        { AttributeName: "customerId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  await Promise.all(
    orders.map(
      async (order) =>
        await documents.send(
          new PutCommand({ TableName: "OrdersTable", Item: order }),
        ),
    ),
  );

  return documents;
}

/**
 * The Query every test here reads one customer's orders with.
 */
const oneCustomer = {
  TableName: "OrdersTable",
  KeyConditionExpression: "customerId = :customer",
  ExpressionAttributeValues: { ":customer": "cust-1" },
};

describe("simulated DynamoDB document client Query", () => {
  it("round-trips native values through a Query", async () => {
    // Given an intercepted document client with orders to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);

    // When one customer's orders are queried with plain JavaScript values.
    const read = await documents.send(
      new QueryCommand({
        ...oneCustomer,
        KeyConditionExpression: "customerId = :customer AND orderId > :after",
        ExpressionAttributeValues: {
          ":customer": "cust-1",
          ":after": "order-1",
        },
      }),
    );

    // Then the items come back as plain JavaScript, with no AttributeValues
    // either way.
    assertArrayLength(read.Items ?? [], 1);
    assertObjectEquals(read.Items?.[0], {
      customerId: "cust-1",
      orderId: "order-2",
      total: 7,
      paid: false,
    });

    // And the counts the operation reports come through untouched, since they
    // were never attribute values.
    assertIdentical(read.Count, 1);
  });

  it("carries a Query on from where the page before it stopped", async () => {
    // Given an intercepted document client with orders to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);
    const page = { ...oneCustomer, Limit: 1 };

    // When a page of one is read.
    const first = await documents.send(new QueryCommand(page));

    // Then it says where to carry on from, as a plain JavaScript key.
    assertObjectEquals(first.LastEvaluatedKey, {
      customerId: "cust-1",
      orderId: "order-1",
    });

    // And that key goes straight back in as the start of the next page, with
    // nothing converted by hand.
    const second = await documents.send(
      new QueryCommand({ ...page, ExclusiveStartKey: first.LastEvaluatedKey }),
    );

    assertIdentical(second.Items?.[0]?.["orderId"], "order-2");

    // The second page fills its Limit as well, so it too says where a third
    // would carry on from, the way AWS does. There is nothing left to read
    // from there.
    const third = await documents.send(
      new QueryCommand({ ...page, ExclusiveStartKey: second.LastEvaluatedKey }),
    );

    assertArrayLength(third.Items ?? [], 0);
    assertUndefined(third.LastEvaluatedKey);
  });

  it("pages a Query through the document client paginator", async () => {
    // Given an intercepted document client with orders to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);

    // When paginateQuery reads a page at a time. It sends the same document
    // Command through the intercepted send, so nothing else is needed.
    // The paginator writes the next start key into the input it was given, so
    // it gets a copy of its own.
    const pages = paginateQuery(
      { client: documents, pageSize: 1 },
      { ...oneCustomer },
    );
    const found: unknown[] = [];
    for await (const page of pages) {
      found.push(...(page.Items ?? []));
    }

    // Then every page carried native values, and the key it fed back was the
    // one it had been given.
    assertArrayLength(found, 2);
    assertObjectEquals(found[0], {
      customerId: "cust-1",
      orderId: "order-1",
      total: 42,
      paid: true,
    });
  });

  it("leaves a client Query on the same client unconverted", async () => {
    // Given a document client that has been intercepted.
    using simSdk = new SimSdk();
    const documents = await interceptedOrders(simSdk);

    // When the Query of @aws-sdk/client-dynamodb is sent through it, which is
    // named the same as the document one.
    const read = await documents.send(
      new ClientQueryCommand({
        ...oneCustomer,
        ExpressionAttributeValues: { ":customer": { S: "cust-1" } },
      }),
    );

    // Then it takes and answers with AttributeValues, as it would through a
    // base client. Sharing a name with a document Command changes nothing
    // about what it does.
    assertArrayLength(read.Items ?? [], 2);
    assertObjectEquals(read.Items?.[0]?.["total"], { N: "42" });
  });
});
