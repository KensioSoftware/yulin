import {
  CreateTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk, SimSdkUnsupportedCommandError } from "../../../sdk/index.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

/**
 * Create the table these tests work on, through an already-intercepted client.
 */
const ordersTable = new CreateTableCommand({
  TableName: "OrdersTable",
  KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
  BillingMode: "PAY_PER_REQUEST",
});

async function createTable(
  simSdk: SimSdk,
  documents: DynamoDBDocumentClient,
): Promise<void> {
  await documents.send(ordersTable);
  await simSdk.simAws.backgroundTasksComplete();
}

describe("simulated DynamoDB document client interception", () => {
  it("is the document client that gets intercepted, not the client it was built from", async () => {
    // Given a base client and a document client built from it.
    using simSdk = new SimSdk();
    const base = new DynamoDBClient({ region: "eu-west-2" });
    const documents = DynamoDBDocumentClient.from(base);

    // Then the document client is a separate object rather than a kind of base
    // client, which is why intercepting the base one does not reach it.
    assertFalse(documents instanceof DynamoDBClient);

    // And intercepting the base client leaves the document client's own send
    // alone.
    simSdk.intercept(base);
    assertUndefined(Object.getOwnPropertyDescriptor(documents, "send"));

    // So it is the document client a test intercepts.
    simSdk.intercept(documents);
    await createTable(simSdk, documents);

    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );
    const read = await documents.send(
      new GetCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
      }),
    );

    assertObjectEquals(read.Item, { orderId: "order-1", total: 42 });
  });

  it("reaches the same simulated tables from both clients at once", async () => {
    // Given both a base client and the document client built from it, each
    // intercepted.
    using simSdk = new SimSdk();
    const base = new DynamoDBClient({ region: "eu-west-2" });
    const documents = DynamoDBDocumentClient.from(base);
    simSdk.intercept(base);
    simSdk.intercept(documents);

    // The table is created through the base client, so the two are working on
    // state neither of them made alone.
    await base.send(ordersTable);
    await simSdk.simAws.backgroundTasksComplete();

    // When an item is written through the document client.
    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );

    // Then the base client sees the table it was written to. The document
    // client shares the base client's config, so both resolve the same
    // Account and Region.
    const listed = await base.send(new ListTablesCommand({}));
    assertArrayEquals(listed.TableNames ?? [], ["OrdersTable"]);
  });

  it("refuses a document Command the simulator has no route for", async () => {
    // Given an intercepted document client.
    using simSdk = new SimSdk();
    const documents = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "eu-west-2" }),
    );
    simSdk.intercept(documents);
    await createTable(simSdk, documents);

    // When a document Command with no route is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: "OrdersTable",
                Item: { orderId: "order-1" },
              },
            },
          ],
        }),
      );
    });

    // Then it is refused by name, before anything tries to convert its values.
    assertInstanceOf(error, SimSdkUnsupportedCommandError);
    assertStringIncludes(error.message, "TransactWriteCommand");
    assertStringIncludes(error.message, "PutCommand");
  });

  it("authorizes a document Command as the caller sending it", async () => {
    // Given an intercepted document client and a table to write to.
    using simSdk = new SimSdk();
    const accountId = simSdk.simAws.defaultAccountId;
    const documents = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "eu-west-2" }),
    );
    simSdk.intercept(documents);
    await createTable(simSdk, documents);

    // When a document Command is sent as a caller with no IAM permissions.
    const error = await assertThrowsErrorAsync(async () => {
      await simSdk.simAws.runAs(
        { kind: "arn", arn: `arn:aws:iam::${accountId}:role/NoPermsRole` },
        async () => {
          await documents.send(
            new PutCommand({
              TableName: "OrdersTable",
              Item: { orderId: "order-1", total: 42 },
            }),
          );
        },
      );
    });

    // Then it is denied. Converting the values changes nothing about who the
    // request is authorized as.
    assertInstanceOf(error, SimIamAccessDenied);

    // And nothing was written under the Account root default.
    const read = await documents.send(
      new GetCommand({
        TableName: "OrdersTable",
        Key: { orderId: "order-1" },
      }),
    );
    assertUndefined(read.Item);
  });

  it("refuses a document Command outside an interception's allow list", async () => {
    // Given an interception that only allows some Commands.
    using simSdk = new SimSdk();
    const documents = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "eu-west-2" }),
    );
    simSdk.intercept(documents, {
      commands: [CreateTableCommand, PutCommand],
    });
    await createTable(simSdk, documents);

    await documents.send(
      new PutCommand({
        TableName: "OrdersTable",
        Item: { orderId: "order-1", total: 42 },
      }),
    );

    // When a Command outside the list is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new GetCommand({
          TableName: "OrdersTable",
          Key: { orderId: "order-1" },
        }),
      );
    });

    // Then it is refused by name, the same way any other Command outside the
    // list is.
    assertIdentical(error.name, "SimSdkCommandNotInterceptedError");
    assertStringIncludes(error.message, "GetCommand");
  });
});
