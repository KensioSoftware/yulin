import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimUpdateItemCommandInput } from "../../command/item/item.command.js";
import type { SimDynamoDbAttributeValue } from "../../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

const key = { id: { S: "order-1" } };

/**
 * A table holding one order, carrying a count, a set of tags and a note.
 */
async function order(): Promise<SimAws> {
  const simAws = new SimAws();
  await simDynamoDbCreatedTableFactory.make({}, simAws);
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "FoobarTable",
      Item: {
        ...key,
        count: { N: "2" },
        tags: { SS: ["new", "gift"] },
        note: { S: "leave by the door" },
      },
    }),
  );

  return simAws;
}

/**
 * The order as it stands after the legacy update given.
 */
async function updated(
  simAws: SimAws,
  updates: SimUpdateItemCommandInput["AttributeUpdates"],
): Promise<Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined> {
  const output = await simAws.dynamoDb().updateItem({
    input: {
      TableName: "FoobarTable",
      Key: key,
      AttributeUpdates: updates,
      ReturnValues: "ALL_NEW",
    },
  });

  return output.Attributes;
}

describe("DynamoDB legacy AttributeUpdates", () => {
  it("puts, removes, adds and deletes in one update", async () => {
    // Given an order.
    const simAws = await order();

    // When one update uses every action, naming a reserved word as well.
    const item = await updated(simAws, {
      name: { Value: { S: "Ada" } },
      note: { Action: "DELETE" },
      count: { Action: "ADD", Value: { N: "3" } },
      tags: { Action: "DELETE", Value: { SS: ["new"] } },
      seen: { Action: "ADD", Value: { NS: ["1"] } },
    });

    // Then each action is applied the way its expression would be.
    assertObjectEquals(item, {
      ...key,
      name: { S: "Ada" },
      count: { N: "5" },
      tags: { SS: ["gift"] },
      seen: { NS: ["1"] },
    });
  });

  it("adds to a number the order lacks as if it were 0", async () => {
    // Given an order.
    const simAws = await order();

    // When an update adds to an attribute the order has none of.
    const item = await updated(simAws, {
      refunds: { Action: "ADD", Value: { N: "-4" } },
    });

    // Then the attribute starts from 0.
    assertObjectEquals(item?.["refunds"], { N: "-4" });
  });

  it("creates nothing when only deleting from a missing item", async () => {
    // Given a table with no item under the key.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When an update only deletes.
    const item = await updated(simAws, { note: { Action: "DELETE" } });

    // Then the key is still empty, as AWS documents.
    assertUndefined(item);
    const read = await simAws
      .dynamoDb()
      .getItem({ input: { TableName: "FoobarTable", Key: key } });
    assertUndefined(read.Item);
  });

  it("creates an item when putting into a missing one", async () => {
    // Given a table with no item under the key.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({}, simAws);

    // When an update puts an attribute.
    const item = await updated(simAws, { note: { Value: { S: "new" } } });

    // Then the item is created.
    assertObjectEquals(item, { ...key, note: { S: "new" } });
  });

  it.each([
    {
      refusal: "an ADD to a string",
      update: { note: { Action: "ADD", Value: { S: "more" } } },
      message: "ADD action with value is not supported for the type S",
    },
    {
      refusal: "a DELETE of a number",
      update: { count: { Action: "DELETE", Value: { N: "1" } } },
      message: "DELETE action with value is not supported for the type N",
    },
    {
      refusal: "an ADD with no Value",
      update: { count: { Action: "ADD" } },
      message: "Only DELETE action is allowed when no attribute value",
    },
    {
      refusal: "an action AWS lacks",
      update: { count: { Action: "INCREMENT", Value: { N: "1" } } },
      message: "Action 'INCREMENT' for count is not one of PUT, DELETE, ADD",
    },
  ])("refuses $refusal", async ({ update, message }) => {
    // Given an order.
    const simAws = await order();

    // When the update says something AWS refuses.
    const error = await assertThrowsErrorAsync(async () =>
      updated(simAws, update),
    );

    // Then it is refused for what it said.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, message);
  });

  it("refuses AttributeUpdates alongside an UpdateExpression", async () => {
    // Given an order.
    const simAws = await order();

    // When an update mixes the two.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().updateItem({
        input: {
          TableName: "FoobarTable",
          Key: key,
          AttributeUpdates: { note: { Action: "DELETE" } },
          UpdateExpression: "REMOVE tags",
        },
      }),
    );

    // Then it is refused, naming both.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Non-expression parameters: {AttributeUpdates} Expression " +
        "parameters: {UpdateExpression}",
    );
  });
});
