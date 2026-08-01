import {
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  NumberValue,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertIdentical,
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
 * Write one attribute natively and read the descriptors it was stored as.
 */
async function storedAs(
  simSdk: SimSdk,
  documents: DynamoDBDocumentClient,
  value: unknown,
): Promise<unknown> {
  await documents.send(
    new PutCommand({ TableName: "ValuesTable", Item: { id: "a", value } }),
  );

  const read = await simSdk.simAws
    .region("eu-west-2")
    .dynamoDb()
    .getItem(
      new GetItemCommand({
        TableName: "ValuesTable",
        Key: { id: { S: "a" } },
      }),
    );

  return read.Item?.["value"];
}

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

describe("simulated DynamoDB document values", () => {
  it("wraps a nested object as a map attribute", async () => {
    // Given an item carrying a nested object.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written, then read as descriptors.
    const stored = await storedAs(simSdk, documents, { street: "1 High St" });

    // Then the nested object is an M attribute. The document client's own
    // marshalling default is what puts the wrapper there: the util-dynamodb
    // default would have stored the bare record, which is not an attribute
    // value at all.
    assertObjectEquals(stored, { M: { street: { S: "1 High St" } } });
  });

  it("wraps a nested list as a list attribute", async () => {
    // Given an item carrying a list of mixed values.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written, then read as descriptors.
    const stored = await storedAs(simSdk, documents, ["a", 1, true]);

    // Then it is an L attribute holding one descriptor per member.
    assertObjectEquals(stored, {
      L: [{ S: "a" }, { N: "1" }, { BOOL: true }],
    });
  });

  it("round-trips a nested object and list", async () => {
    // Given an item carrying nesting several levels deep.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    const value = {
      lines: [{ sku: "a", quantity: 2 }],
      address: { postcode: "SW1A 1AA", tags: ["home"] },
    };

    // When it goes out and comes back.
    const read = await roundTrip(documents, value);

    // Then it is the same plain JavaScript it went in as.
    assertObjectEquals(read, value);
  });

  it("round-trips a string set as a Set", async () => {
    // Given an item carrying a Set of strings.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it goes out and comes back.
    const read = await roundTrip(documents, new Set(["a", "b"]));

    // Then it is a Set again, rather than the array a list would give.
    assertInstanceOf(read, Set);
    assertArrayEquals([...read], ["a", "b"]);
  });

  it("round-trips a number set as a Set of numbers", async () => {
    // Given an item carrying a Set of numbers.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it goes out and comes back.
    const read = await roundTrip(documents, new Set([1, 2]));

    // Then the members are numbers again.
    assertInstanceOf(read, Set);
    assertArrayEquals([...read], [1, 2]);
  });

  it("round-trips binary as the bytes it was given", async () => {
    // Given an item carrying bytes.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When they go out and come back.
    const read = await roundTrip(documents, new Uint8Array([1, 2, 3]));

    // Then they are the same bytes.
    assertInstanceOf(read, Uint8Array);
    assertArrayEquals([...read], [1, 2, 3]);
  });

  it("refuses an undefined attribute rather than dropping it", async () => {
    // Given an item carrying an undefined value.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ValuesTable",
          Item: { id: "a", value: undefined },
        }),
      );
    });

    // Then it is refused, naming where it sat and why the real client would
    // have dropped it.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "input.Item.value is undefined");
    assertStringIncludes(error.message, "removeUndefinedValues");
  });

  it("refuses an empty Set, as DynamoDB has no empty set", async () => {
    // Given an item carrying an empty Set.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ValuesTable",
          Item: { id: "a", value: new Set() },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "empty Set");
  });

  it("names the path inside a nested value it cannot convert", async () => {
    // Given an item carrying something with no attribute type, buried in a
    // list inside a map.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ValuesTable",
          Item: { id: "a", value: { lines: [Symbol("nope")] } },
        }),
      );
    });

    // Then the refusal says where it sat, which the real client does not.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "input.Item.value.lines[0]");
  });
});

describe("simulated DynamoDB document numbers", () => {
  it("round-trips a bigint past the safe integer range", async () => {
    // Given a number too large for a JavaScript number to hold exactly.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written as a bigint.
    const read = await roundTrip(documents, 9_007_199_254_740_993n);

    // Then it comes back as a bigint with its digits intact, which is what the
    // real document client answers with rather than rounding it.
    assertIdentical(read, 9_007_199_254_740_993n);
  });

  it("refuses a number past the safe integer range", async () => {
    // Given a number that has already lost digits by the time it is written.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ValuesTable",
          Item: { id: "a", value: Number.MAX_SAFE_INTEGER + 10 },
        }),
      );
    });

    // Then it is refused rather than stored rounded, and the refusal says what
    // to write instead.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "bigint");
    assertStringIncludes(error.message, "NumberValue");
  });

  it("keeps every digit of a NumberValue", async () => {
    // Given a decimal with more digits than a JavaScript number carries.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);
    const digits = "1.2345678901234567890123456789";

    // When it is written as a NumberValue, which is the way the document
    // client offers for exactly this.
    const stored = await storedAs(simSdk, documents, NumberValue.from(digits));

    // Then the table holds every digit.
    assertObjectEquals(stored, { N: digits });
  });

  it("rounds a stored decimal the way the document client rounds it", async () => {
    // Given a decimal written through the document client as a NumberValue,
    // which is what carries its digits through the conversion into the table.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);
    const digits = "1.2345678901234567890123456789";

    await storedAs(simSdk, documents, NumberValue.from(digits));

    // When it is read through the document client.
    const read = await documents.send(
      new GetCommand({ TableName: "ValuesTable", Key: { id: "a" } }),
    );

    // Then it comes back as a JavaScript number, having lost the digits a
    // JavaScript number cannot hold.
    assertIdentical(read.Item?.["value"], 1.2345678901234567);

    // And the table still holds every digit, so the loss is the document
    // client's, here as on AWS.
    const stored = await simSdk.simAws
      .region("eu-west-2")
      .dynamoDb()
      .getItem(
        new GetItemCommand({
          TableName: "ValuesTable",
          Key: { id: { S: "a" } },
        }),
      );
    assertObjectEquals(stored.Item?.["value"], { N: digits });
  });
});
