import { describe, it } from "vitest";
import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertBufferEqual,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";

describe("DynamoDB PutItemCommand", () => {
  it.each([
    {
      name: "string scalar",
      item: {
        userName: { S: "Foo McBar" },
      },
      assertAttribute: (attributes: { userName?: { S: string } }) => {
        assertIdentical(attributes.userName?.S, "Foo McBar");
      },
    },
    {
      name: "number scalar",
      item: {
        favouriteNumber: { N: "42" },
      },
      assertAttribute: (attributes: { favouriteNumber?: { N: string } }) => {
        assertIdentical(attributes.favouriteNumber?.N, "42");
      },
    },
    {
      name: "boolean scalar",
      item: {
        likesPizza: { BOOL: true },
      },
      assertAttribute: (attributes: { likesPizza?: { BOOL: boolean } }) => {
        assertTrue(attributes.likesPizza?.BOOL);
      },
    },
    {
      name: "null scalar",
      item: {
        missingValue: { NULL: true },
      },
      assertAttribute: (attributes: { missingValue?: { NULL: boolean } }) => {
        assertTrue(attributes.missingValue?.NULL);
      },
    },
    {
      name: "binary",
      item: {
        profilePicture: {
          B: new Uint8Array([137, 80, 78, 71]),
        },
      },
      assertAttribute: (attributes: { profilePicture?: { B: Uint8Array } }) => {
        assertBufferEqual(
          attributes.profilePicture?.B,
          new Uint8Array([137, 80, 78, 71]),
        );
      },
    },
    {
      name: "string set",
      item: {
        favouriteColours: { SS: ["purple", "red"] },
      },
      assertAttribute: (attributes: {
        favouriteColours?: { SS?: string[] };
      }) => {
        assertIdentical(attributes.favouriteColours?.SS?.[0], "purple");
      },
    },
    {
      name: "number set",
      item: {
        luckyNumbers: { NS: ["7", "13", "42"] },
      },
      assertAttribute: (attributes: { luckyNumbers?: { NS?: string[] } }) => {
        assertIdentical(attributes.luckyNumbers?.NS?.[2], "42");
      },
    },
    {
      name: "binary set",
      item: {
        binaryTags: {
          BS: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
        },
      },
      assertAttribute: (attributes: { binaryTags?: { BS?: Uint8Array[] } }) => {
        assertBufferEqual(
          attributes.binaryTags?.BS?.[1],
          new Uint8Array([4, 5, 6]),
        );
      },
    },
    {
      name: "list",
      item: {
        shoppingList: {
          L: [{ S: "milk" }, { S: "eggs" }],
        },
      },
      assertAttribute: (attributes: {
        shoppingList?: { L?: { S?: string }[] };
      }) => {
        assertIdentical(attributes.shoppingList?.L?.[0]?.S, "milk");
      },
    },
    {
      name: "nested map",
      item: {
        address: {
          M: {
            street: { S: "123 High Street" },
            city: { S: "London" },
            postcode: { S: "AB1 2CD" },
            coordinates: {
              M: {
                lat: { N: "51.5" },
                lon: { N: "-0.1" },
              },
            },
          },
        },
      },
      assertAttribute: (attributes: {
        address?: {
          M?: {
            street?: { S?: string };
            city?: { S?: string };
            postcode?: { S?: string };
            coordinates?: {
              M?: { lat: { N?: string }; lon: { N?: string } };
            };
          };
        };
      }) => {
        assertIdentical(attributes.address?.M?.street?.S, "123 High Street");
        assertIdentical(attributes.address.M.city?.S, "London");
        assertIdentical(attributes.address.M.postcode?.S, "AB1 2CD");
        assertIdentical(attributes.address.M.coordinates?.M?.lat.N, "51.5");
        assertIdentical(attributes.address.M.coordinates.M.lon.N, "-0.1");
      },
    },
  ])(
    "puts new $name Item attribute into DynamoDB Table, returns attributes",
    async ({ item, assertAttribute }) => {
      const simAws = new SimAws();
      const simDynamoDatabase = simAws.dynamoDb();

      await simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "FooTable",
          KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );

      const putItemOutput = await simDynamoDatabase.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: {
            userId: { S: "4fad1110-e6dd-46ed-966b-356ba12f8102" },
            ...item,
          },
        }),
      );

      assertNonNullable(putItemOutput.Attributes);
      assertIdentical(
        putItemOutput.Attributes["userId"]?.S,
        "4fad1110-e6dd-46ed-966b-356ba12f8102",
      );

      assertAttribute(putItemOutput.Attributes);

      await simAws.backgroundTasksComplete();
    },
  );

  it("puts new Item into DynamoDB Table with partition key + sort key", async () => {
    const simAws = new SimAws();

    const simDynamoDatabase = simAws.dynamoDb();

    await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "FooTable",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "orderId", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const putItemOutput = await simDynamoDatabase.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          userId: { S: "06a3f1a5-df48-4951-8316-6c99ca1ec662" },
          orderId: { S: "736dbd1c-e02a-4526-8534-0f1ab9314db8" },
          somethingElse: { N: "12345" },
        },
      }),
    );

    assertNonNullable(putItemOutput.Attributes);
    assertIdentical(
      putItemOutput.Attributes["userId"]?.S,
      "06a3f1a5-df48-4951-8316-6c99ca1ec662",
    );
    assertIdentical(
      putItemOutput.Attributes["orderId"]?.S,
      "736dbd1c-e02a-4526-8534-0f1ab9314db8",
    );
    assertIdentical(putItemOutput.Attributes["somethingElse"]?.N, "12345");
  });
});
