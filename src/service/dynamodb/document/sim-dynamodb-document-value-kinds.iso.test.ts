import {
  type AttributeValue,
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";

/**
 * An intercepted document client over a table keyed by `id`.
 */
async function interceptedDocuments(
  simSdk: SimSdk,
): Promise<DynamoDBDocumentClient> {
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "eu-west-2" }),
  );
  simSdk.intercept(documents);

  await documents.send(
    new CreateTableCommand({
      TableName: "ValuesTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  return documents;
}

/**
 * Write one attribute natively and read the whole item back natively.
 */
async function roundTrip(
  documents: DynamoDBDocumentClient,
  value: unknown,
): Promise<unknown> {
  await documents.send(
    new PutCommand({ TableName: "ValuesTable", Item: { id: "a", value } }),
  );

  const read = await documents.send(
    new GetCommand({ TableName: "ValuesTable", Key: { id: "a" } }),
  );

  return read.Item?.["value"];
}

/**
 * Write one attribute as a descriptor and read it back natively, for the kinds
 * a document client writes differently to how it reads them.
 */
async function readNatively(
  simSdk: SimSdk,
  documents: DynamoDBDocumentClient,
  attribute: AttributeValue,
): Promise<unknown> {
  await simSdk.simAws
    .region("eu-west-2")
    .dynamoDb()
    .putItem(
      new PutItemCommand({
        TableName: "ValuesTable",
        Item: { id: { S: "a" }, value: attribute },
      }),
    );

  const read = await documents.send(
    new GetCommand({ TableName: "ValuesTable", Key: { id: "a" } }),
  );

  return read.Item?.["value"];
}

describe("simulated DynamoDB document value kinds", () => {
  it("writes a Map as a map attribute", async () => {
    // Given an item carrying a Map, which the document client takes as well as
    // a plain object.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "ValuesTable",
        Item: {
          id: "a",
          value: new Map([
            ["street", "1 High St"],
            ["town", "Reading"],
          ]),
        },
      }),
    );

    // When it is read back.
    const read = await documents.send(
      new GetCommand({ TableName: "ValuesTable", Key: { id: "a" } }),
    );

    // Then it comes back as a plain object, which is what a map attribute
    // reads as. The Map was a way of writing it, not a kind DynamoDB holds.
    assertObjectEquals(read.Item?.["value"], {
      street: "1 High St",
      town: "Reading",
    });
  });

  it("round-trips a binary set", async () => {
    // Given an item carrying a Set of bytes.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it goes out and comes back.
    const read = await roundTrip(
      documents,
      new Set([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
    );

    // Then it is a Set of the same bytes.
    assertInstanceOf(read, Set);
    assertArrayEquals(
      [...read].map((member) => [...(member as Uint8Array)].join(",")),
      ["1,2", "3,4"],
    );
  });

  it("writes a Set of bigints as a number set", async () => {
    // Given an item carrying a Set of bigints.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    await documents.send(
      new PutCommand({
        TableName: "ValuesTable",
        Item: { id: "a", value: new Set([9_007_199_254_740_993n, 2n]) },
      }),
    );

    // When the descriptors are read.
    const stored = await simSdk.simAws
      .region("eu-west-2")
      .dynamoDb()
      .getItem(
        new GetItemCommand({
          TableName: "ValuesTable",
          Key: { id: { S: "a" } },
        }),
      );

    // Then the digits survive, which is why a bigint is the way to write a
    // large number.
    assertObjectEquals(stored.Item?.["value"], {
      NS: ["9007199254740993", "2"],
    });
  });

  it("leaves a function out of a map, as the real client leaves it out", async () => {
    // Given an item carrying an object with a method on it.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written and read back.
    const read = await roundTrip(documents, {
      street: "1 High St",
      format: () => "1 High St",
    });

    // Then only the data is there.
    assertObjectEquals(read, { street: "1 High St" });
  });

  it("refuses a Set of a kind DynamoDB has no set for", async () => {
    // Given an item carrying a Set of booleans.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ValuesTable",
          Item: { id: "a", value: new Set([true, false]) },
        }),
      );
    });

    // Then it is refused, naming what DynamoDB does have.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "Set of boolean");
  });

  it("refuses a number that is not a number", async () => {
    // Given an item carrying a value arithmetic went wrong on.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ValuesTable",
          Item: { id: "a", value: NaN },
        }),
      );
    });

    // Then it is refused, since DynamoDB has no such number.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "DynamoDB has no such number");
  });

  it("refuses to read a stored number it has nothing to answer with", async () => {
    // Given a table holding a decimal too large for a JavaScript number and
    // not whole, written through the ordinary Command so nothing converted it.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is read through the document client.
    const error = await assertThrowsErrorAsync(async () => {
      await readNatively(simSdk, documents, { N: "12345678901234567890.5" });
    });

    // Then it is refused rather than rounded away silently: a bigint cannot
    // carry the fraction, and a JavaScript number cannot carry the digits.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "nothing to answer with");
  });
});
