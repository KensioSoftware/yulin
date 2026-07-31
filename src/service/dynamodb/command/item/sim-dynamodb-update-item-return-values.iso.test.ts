import {
  CreateTableCommand,
  PutItemCommand,
  type ReturnValue,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
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
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table with one string partition key, holding nothing yet.
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

  return simDynamoDb;
}

/**
 * An order at the status given.
 */
async function orderAt(
  simDynamoDb: SimDynamoDb,
  status: string,
): Promise<void> {
  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: { orderId: { S: "order-1" }, status: { S: status } },
    }),
  );
}

/**
 * An update setting the status, asking for whatever the mode names back.
 */
function updateTo(
  status: string,
  returnValues?: ReturnValue,
): UpdateItemCommand {
  return new UpdateItemCommand({
    TableName: "FooTable",
    Key: { orderId: { S: "order-1" } },
    UpdateExpression: "SET #s = :status",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":status": { S: status } },
    ReturnValues: returnValues,
  });
}

describe("DynamoDB UpdateItemCommand ReturnValues", () => {
  it("answers with nothing by default", async () => {
    // Given an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await orderAt(simDynamoDb, "packing");

    // When an update asks for nothing back.
    const output = await simDynamoDb.updateItem(updateTo("shipped"));

    // Then it answers with no attributes.
    assertUndefined(output.Attributes);
  });

  it("answers with the item as it was for ALL_OLD", async () => {
    // Given an order that is packing.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await orderAt(simDynamoDb, "packing");

    // When an update asks for the item it changed.
    const output = await simDynamoDb.updateItem(updateTo("shipped", "ALL_OLD"));

    // Then it answers with the item as it stood before the update.
    assertIdentical(output.Attributes?.["status"]?.S, "packing");
  });

  it("answers with nothing for ALL_OLD when the key held nothing", async () => {
    // Given a table holding nothing.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update creates the item and asks for the one it changed.
    const output = await simDynamoDb.updateItem(updateTo("packing", "ALL_OLD"));

    // Then there is no Attributes at all, since there was no item to report.
    assertUndefined(output.Attributes);
  });

  it("answers with the item as it now is for ALL_NEW", async () => {
    // Given an order that is packing.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await orderAt(simDynamoDb, "packing");

    // When an update asks for the item it left.
    const output = await simDynamoDb.updateItem(updateTo("shipped", "ALL_NEW"));

    // Then it answers with the whole item, changes and all.
    assertNonNullable(output.Attributes);
    assertIdentical(output.Attributes["status"]?.S, "shipped");
    assertIdentical(output.Attributes["orderId"]?.S, "order-1");
  });

  it("refuses the modes that report only what the update touched", async () => {
    // Given an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await orderAt(simDynamoDb, "packing");

    // When an update asks for the attributes it changed.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.updateItem(updateTo("shipped", "UPDATED_NEW")),
    );

    // Then it is refused by name rather than answered with the whole item.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "ReturnValues UPDATED_NEW");
  });

  it("refuses a mode UpdateItem does not have", async () => {
    // Given an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await orderAt(simDynamoDb, "packing");

    // When an update asks for something that is not a mode at all. The SDK
    // types rule this out, so the request is built the way one arriving over
    // the wire would be.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.updateItem({
        input: {
          TableName: "FooTable",
          Key: { orderId: { S: "order-1" } },
          UpdateExpression: "REMOVE status",
          ReturnValues: "EVERYTHING",
        },
      }),
    );

    // Then it is a ValidationException naming the modes it does have.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "UpdateItem takes NONE, ALL_OLD or ALL_NEW.",
    );
  });
});
