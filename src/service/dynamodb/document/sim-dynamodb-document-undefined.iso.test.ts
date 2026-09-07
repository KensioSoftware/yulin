import {
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  type TranslateConfig,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";

/**
 * A document client that drops undefined values, as an application asks for
 * one when it hands the client a partly filled object.
 */
const dropsUndefined: TranslateConfig = {
  marshallOptions: { removeUndefinedValues: true },
};

/**
 * An intercepted document client over a table keyed by `id`.
 */
async function interceptedDocuments(
  simSdk: SimSdk,
  translateConfig?: TranslateConfig,
): Promise<DynamoDBDocumentClient> {
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "eu-west-2" }),
    translateConfig,
  );
  simSdk.intercept(documents);

  await documents.send(
    new CreateTableCommand({
      TableName: "ItemsTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  return documents;
}

/**
 * The descriptors one attribute of the written item was stored as.
 */
async function storedAs(simSdk: SimSdk, name: string): Promise<unknown> {
  const read = await simSdk.simAws
    .region("eu-west-2")
    .dynamoDb()
    .getItem(
      new GetItemCommand({ TableName: "ItemsTable", Key: { id: { S: "a" } } }),
    );

  // oxlint-disable-next-line security/detect-object-injection -- an attribute name this test named itself.
  return read.Item?.[name];
}

describe("simulated DynamoDB document undefined values", () => {
  it("drops an undefined value out of a map", async () => {
    // Given a client that drops undefined values, and an item whose nested
    // object has one field filled and one left undefined.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, dropsUndefined);

    // When the item is written.
    await documents.send(
      new PutCommand({
        TableName: "ItemsTable",
        Item: { id: "a", page: { title: "t", summary: undefined } },
      }),
    );

    // Then the map holds the field that was filled, and nothing stands where
    // the undefined one was.
    assertObjectEquals(await storedAs(simSdk, "page"), {
      M: { title: { S: "t" } },
    });
  });

  it("drops an undefined member out of a list, closing the gap", async () => {
    // Given a client that drops undefined values, and an item carrying a list
    // with a hole in the middle.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, dropsUndefined);

    // When the item is written.
    await documents.send(
      new PutCommand({
        TableName: "ItemsTable",
        Item: { id: "a", lines: ["first", undefined, "third"] },
      }),
    );

    // Then the members after it moved up, rather than a NULL standing where
    // the undefined one was. That is what the real conversion does: it filters
    // the list before it converts it.
    assertObjectEquals(await storedAs(simSdk, "lines"), {
      L: [{ S: "first" }, { S: "third" }],
    });
  });

  it("drops an undefined member out of a set", async () => {
    // Given a client that drops undefined values, and an item carrying a Set
    // with one.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, dropsUndefined);

    // When the item is written.
    await documents.send(
      new PutCommand({
        TableName: "ItemsTable",
        Item: { id: "a", tags: new Set(["priority", undefined]) },
      }),
    );

    // Then the set holds the members that were there.
    assertObjectEquals(await storedAs(simSdk, "tags"), { SS: ["priority"] });
  });

  it("drops an undefined value out of an updated map", async () => {
    // Given a client that drops undefined values.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, dropsUndefined);

    // When an update sets an attribute to a partly filled object.
    const updated = await documents.send(
      new UpdateCommand({
        TableName: "ItemsTable",
        Key: { id: "a" },
        UpdateExpression: "SET page = :page",
        ExpressionAttributeValues: {
          ":page": { title: "t", summary: undefined },
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    // Then the expression value went in without the undefined field.
    assertObjectEquals(updated.Attributes, {
      id: "a",
      page: { title: "t" },
    });
  });

  it("drops an undefined value out of a batch-written map", async () => {
    // Given a client that drops undefined values.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, dropsUndefined);

    // When a batch writes an item whose nested object has one.
    await documents.send(
      new BatchWriteCommand({
        RequestItems: {
          ItemsTable: [
            {
              PutRequest: {
                Item: { id: "a", page: { title: "t", summary: undefined } },
              },
            },
          ],
        },
      }),
    );

    // Then the item was written without it.
    assertObjectEquals(await storedAs(simSdk, "page"), {
      M: { title: { S: "t" } },
    });
  });

  it("refuses an undefined value in a map when the client asked for none", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an item carrying an undefined field inside a map is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ItemsTable",
          Item: { id: "a", page: { title: "t", summary: undefined } },
        }),
      );
    });

    // Then it is refused where it sat, naming the option that would drop it,
    // which is where the real client refuses it too.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "input.Item.page.summary is undefined");
    assertStringIncludes(error.message, "removeUndefinedValues");
  });

  it("refuses an undefined member of a list when the client asked for none", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an item carrying a list with a hole in it is written.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new PutCommand({
          TableName: "ItemsTable",
          Item: { id: "a", lines: ["first", undefined, "third"] },
        }),
      );
    });

    // Then it is refused at the position it sat at.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "input.Item.lines[1] is undefined");
  });

  it("refuses an undefined value in an updated map when the client asked for none", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an update sets an attribute to a partly filled object.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new UpdateCommand({
          TableName: "ItemsTable",
          Key: { id: "a" },
          UpdateExpression: "SET page = :page",
          ExpressionAttributeValues: {
            ":page": { title: "t", summary: undefined },
          },
        }),
      );
    });

    // Then it is refused, naming the expression value it sat in.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(
      error.message,
      "input.ExpressionAttributeValues.:page.summary is undefined",
    );
  });

  it("refuses an undefined value in a batch-written map when the client asked for none", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When a batch writes an item whose nested object has one.
    const error = await assertThrowsErrorAsync(async () => {
      await documents.send(
        new BatchWriteCommand({
          RequestItems: {
            ItemsTable: [
              {
                PutRequest: {
                  Item: { id: "a", page: { title: "t", summary: undefined } },
                },
              },
            ],
          },
        }),
      );
    });

    // Then it is refused, naming the request it sat in.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(
      error.message,
      "RequestItems.ItemsTable[0].PutRequest.Item.page.summary is undefined",
    );
  });

  it("leaves out an undefined attribute of a batch-written item", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When a batch writes an item with an undefined attribute.
    await documents.send(
      new BatchWriteCommand({
        RequestItems: {
          ItemsTable: [
            {
              PutRequest: { Item: { id: "a", kept: "here", gone: undefined } },
            },
          ],
        },
      }),
    );

    // Then the attribute is not there and the rest of the item is. An item is
    // not a map, so the real client drops it without being asked to.
    assertObjectEquals(await storedAs(simSdk, "kept"), { S: "here" });
    assertUndefined(await storedAs(simSdk, "gone"));
  });

  it("leaves out an undefined expression value", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an update carries an expression value the caller left undefined,
    // alongside the one its expression uses.
    const updated = await documents.send(
      new UpdateCommand({
        TableName: "ItemsTable",
        Key: { id: "a" },
        UpdateExpression: "SET kept = :kept",
        ExpressionAttributeValues: { ":kept": "here", ":gone": undefined },
        ReturnValues: "ALL_NEW",
      }),
    );

    // Then the undefined one never reached the request, so nothing was left
    // over for the table to complain about.
    assertObjectEquals(updated.Attributes, { id: "a", kept: "here" });
  });
});
