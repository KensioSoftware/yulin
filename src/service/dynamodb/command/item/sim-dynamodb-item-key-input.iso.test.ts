import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * The Key a request names one item by, before it has been checked.
 */
type SimDynamoDbKeyInput = Record<string, SimDynamoDbAttributeValue>;

/**
 * A table with a string partition key and a number sort key, so a Key can be
 * missing an element, of the wrong type, empty, or carry one attribute too
 * many.
 */
async function tableFor(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [
        { AttributeName: "userId", KeyType: "HASH" },
        { AttributeName: "orderId", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "orderId", AttributeType: "N" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  return simDynamoDb;
}

/**
 * The commands that name one item by its primary key. Both are held to the same
 * rules, so both are checked against every case.
 */
const keyedCommands = [
  {
    named: "GetItem",
    send: async (
      simDynamoDb: SimDynamoDb,
      key: SimDynamoDbKeyInput,
    ): Promise<unknown> =>
      simDynamoDb.getItem({ input: { TableName: "FooTable", Key: key } }),
  },
  {
    named: "DeleteItem",
    send: async (
      simDynamoDb: SimDynamoDb,
      key: SimDynamoDbKeyInput,
    ): Promise<unknown> =>
      simDynamoDb.deleteItem({ input: { TableName: "FooTable", Key: key } }),
  },
];

describe.each(keyedCommands)("DynamoDB $named Key", ({ send }) => {
  /**
   * Name an item by a Key real DynamoDB would refuse, and read the refusal.
   */
  async function refused(key: SimDynamoDbKeyInput): Promise<Error> {
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    return await assertThrowsErrorAsync(async () => send(simDynamoDb, key));
  }

  it("refuses a Key with no partition key", async () => {
    // When a Key leaves out the partition key.
    const error = await refused({ orderId: { N: "1" } });

    // Then the missing key is named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "One of the required keys was not given a value: userId",
    );
  });

  it("refuses a Key with no sort key", async () => {
    // When a Key leaves out the sort key.
    const error = await refused({ userId: { S: "user-1" } });

    // Then the missing key is named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "One of the required keys was not given a value: orderId",
    );
  });

  it("refuses a Key carrying an attribute that is not part of the key", async () => {
    // When a Key carries an attribute alongside the whole primary key.
    const error = await refused({
      userId: { S: "user-1" },
      orderId: { N: "1" },
      note: { S: "extra" },
    });

    // Then the extra attribute is named. An item may carry it, but a Key has
    // nothing to match it against.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The provided key element does not match the schema",
    );
    assertStringIncludes(error.message, "note");
  });

  it("refuses a key value of the wrong type", async () => {
    // When the sort key carries a string where the table declared a number.
    const error = await refused({
      userId: { S: "user-1" },
      orderId: { S: "1" },
    });

    // Then the mismatch is reported against what the table declared.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Type mismatch for key attribute orderId, expected N but got S",
    );
  });

  it("refuses an empty key value", async () => {
    // When the partition key carries an empty string.
    const error = await refused({
      userId: { S: "" },
      orderId: { N: "1" },
    });

    // Then it is refused, as it is on the way in.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "The AttributeValue for key attribute userId cannot be empty",
    );
  });
});
