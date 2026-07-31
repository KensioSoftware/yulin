import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  type UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table holding one order with an address on it.
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
        address: { M: { city: { S: "Leeds" } } },
      },
    }),
  );

  return simDynamoDb;
}

/**
 * The error an update on that order is refused with.
 */
async function refusalOf(
  simDynamoDb: SimDynamoDb,
  input: Omit<UpdateItemCommandInput, "TableName" | "Key">,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () =>
    simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        ...input,
      }),
    ),
  );
}

describe("DynamoDB UpdateItemCommand validation", () => {
  it("refuses a clause keyword written twice", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When one expression opens two SET clauses.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET a = :one SET b = :two",
      ExpressionAttributeValues: { ":one": { N: "1" }, ":two": { N: "2" } },
    });

    // Then it is refused the way real DynamoDB refuses it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      `The "SET" section can only be used once in an update expression;`,
    );
  });

  it("refuses an expression that starts with something other than a clause", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the expression opens with a word that is not a clause keyword.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "PUT a = :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then the refusal names the expression and what was expected.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Invalid UpdateExpression");
    assertStringIncludes(error.message, "SET, REMOVE, ADD or DELETE expected");
  });

  it("refuses a SET action that assigns nothing", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a SET action leaves out its '='.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET a :one",
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused as a syntax error.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "assigns to a document path with '='");
  });

  it("refuses an empty update expression", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the expression says nothing.
    const error = await refusalOf(simDynamoDb, { UpdateExpression: "  " });

    // Then it is refused rather than read as an update that does nothing.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "an expression cannot be empty");
  });

  it("refuses a placeholder the request does not define", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the expression uses a value nothing defines.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET a = :missing",
    });

    // Then the refusal names the placeholder.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "ExpressionAttributeValues does not define :missing",
    );
  });

  it("refuses a placeholder no expression uses", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the request defines a value the expressions do not use.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET a = :one",
      ConditionExpression: "attribute_exists(orderId)",
      ExpressionAttributeValues: { ":one": { N: "1" }, ":spare": { N: "2" } },
    });

    // Then it is refused, naming the one that went unused rather than the one
    // the update expression used.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "unused in expressions: :spare");
  });

  it("refuses a request carrying placeholders and no expression to use them in", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update says nothing to change and still defines a value.
    const error = await refusalOf(simDynamoDb, {
      ExpressionAttributeValues: { ":one": { N: "1" } },
    });

    // Then it is refused rather than quietly ignored.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "can only be specified when using expressions",
    );
  });

  it("refuses an assignment into a map the item does not have", async () => {
    // Given an order with no billing address.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an assignment reaches into that missing attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET billing.city = :city",
      ExpressionAttributeValues: { ":city": { S: "York" } },
    });

    // Then it is refused, as real DynamoDB refuses it rather than making the
    // map on the way past.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The document path provided in the update expression is invalid for update",
    );
    assertStringIncludes(error.message, "billing.city");
  });

  it("refuses an assignment reading an attribute the item does not have", async () => {
    // Given an order with no note on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an assignment reads that attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET copy = note",
    });

    // Then it is refused rather than assigning nothing, which is what
    // if_not_exists is for.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "refers to an attribute that does not exist in the item: 'note'",
    );
  });

  it("refuses an if_not_exists whose fallback is missing too", async () => {
    // Given an order with neither a note nor a draft note on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an assignment falls back from one to the other.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET copy = if_not_exists(note, draft)",
    });

    // Then it is refused, naming the whole call rather than one part of it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "'if_not_exists(note, draft)'");
  });

  it("refuses two actions writing over each other", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When one action writes inside what another one removes.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET address.city = :city REMOVE address",
      ExpressionAttributeValues: { ":city": { S: "York" } },
    });

    // Then the pair is refused, since it does not say what the item should end
    // up with.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Two document paths overlap");
  });

  it("refuses an update that would change the primary key", async () => {
    // Given a table keyed by order ID.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update assigns to that key attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET orderId = :other",
      ExpressionAttributeValues: { ":other": { S: "order-2" } },
    });

    // Then it is refused, since it names one item and would write another.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Cannot update attribute orderId. This attribute is part of the key",
    );

    // And the order is where it was.
    const stored = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );
    assertIdentical(stored.Item?.["status"]?.S, "packing");
  });

  it("refuses an update that would remove the primary key", async () => {
    // Given a table keyed by order ID.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update removes that key attribute.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "REMOVE orderId",
    });

    // Then it is refused the same way an assignment to it is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Cannot remove attribute orderId. This attribute is part of the key",
    );
  });

  it("refuses an update that would make the item bigger than DynamoDB holds", async () => {
    // Given an order already carrying most of the 400 KB an item can.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          orderId: { S: "order-1" },
          notes: { S: "n".repeat(300 * 1024) },
        },
      }),
    );

    // When an update adds another attribute that takes it past the limit.
    const error = await refusalOf(simDynamoDb, {
      UpdateExpression: "SET more = :more",
      ExpressionAttributeValues: { ":more": { S: "m".repeat(200 * 1024) } },
    });

    // Then the write is refused, as it would be for a PutItem of that item.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Item size has exceeded");
  });

  it("refuses the legacy AttributeUpdates", async () => {
    // Given a table holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update says what to change the old way.
    const error = await refusalOf(simDynamoDb, {
      AttributeUpdates: {
        status: { Value: { S: "shipped" }, Action: "PUT" },
      },
    });

    // Then it is refused by name, rather than leaving the item unchanged.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, "AttributeUpdates is not simulated");
  });
});
