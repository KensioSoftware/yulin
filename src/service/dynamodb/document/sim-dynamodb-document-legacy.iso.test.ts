import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertIdentical,
  assertObjectEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

const order = { customerId: "cust-1", orderId: "order-1", total: 42 };
const key = { customerId: "cust-1", orderId: "order-1" };

/**
 * An intercepted document client, and a table holding one order.
 */
async function interceptedOrder(
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
  await documents.send(
    new PutCommand({ TableName: "OrdersTable", Item: order }),
  );

  return documents;
}

describe("simulated DynamoDB document client legacy parameters", () => {
  it("converts the native values of KeyConditions and QueryFilter", async () => {
    // Given an intercepted document client with an order to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrder(simSdk);

    // When the order is queried the legacy way with plain values.
    const read = await documents.send(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditions: {
          customerId: {
            ComparisonOperator: "EQ",
            AttributeValueList: ["cust-1"],
          },
        },
        QueryFilter: {
          total: { ComparisonOperator: "GT", AttributeValueList: [40] },
        },
      }),
    );

    // Then it is found.
    assertObjectEquals(read.Items, [order]);
  });

  it("converts the native values of a ScanFilter", async () => {
    // Given an intercepted document client with an order to read.
    using simSdk = new SimSdk();
    const documents = await interceptedOrder(simSdk);

    // When the table is scanned for orders under 40.
    const read = await documents.send(
      new ScanCommand({
        TableName: "OrdersTable",
        ScanFilter: {
          total: { ComparisonOperator: "LT", AttributeValueList: [40] },
        },
      }),
    );

    // Then the order is left out.
    assertObjectEquals(read.Items, []);
  });

  it("converts the native values of Expected and AttributeUpdates", async () => {
    // Given an intercepted document client with an order to change.
    using simSdk = new SimSdk();
    const documents = await interceptedOrder(simSdk);

    // When the order is updated the legacy way with plain values.
    const output = await documents.send(
      new UpdateCommand({
        TableName: "OrdersTable",
        Key: key,
        Expected: { total: { Value: 42 } },
        AttributeUpdates: {
          total: { Action: "ADD", Value: 8 },
          tags: { Action: "PUT", Value: new Set(["gift"]) },
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    // Then the update is applied to the order it expected.
    assertObjectEquals(output.Attributes, {
      ...order,
      total: 50,
      tags: new Set(["gift"]),
    });
  });

  it("converts the native values of an Expected comparison", async () => {
    // Given an intercepted document client with an order to delete.
    using simSdk = new SimSdk();
    const documents = await interceptedOrder(simSdk);

    // When a delete expects a total the order does not have.
    const error = await assertThrowsErrorAsync(async () =>
      documents.send(
        new DeleteCommand({
          TableName: "OrdersTable",
          Key: key,
          Expected: {
            total: {
              ComparisonOperator: "BETWEEN",
              AttributeValueList: [1, 9],
            },
          },
        }),
      ),
    );

    // Then the condition fails and the order is still there.
    assertIdentical(error.name, "ConditionalCheckFailedException");
    const read = await documents.send(
      new GetCommand({ TableName: "OrdersTable", Key: key }),
    );
    assertObjectEquals(read.Item, order);
  });
});
