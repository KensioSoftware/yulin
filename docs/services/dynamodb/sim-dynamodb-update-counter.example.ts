/**
 * Counting a view, appending to a list, and tagging an item.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "pageId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "pageId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: {
      pageId: { S: "page-1" },
      history: { L: [{ S: "created" }] },
      tags: { SS: ["draft"] },
    },
  }),
);

const counted = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { pageId: { S: "page-1" } },
    UpdateExpression:
      "SET views = if_not_exists(views, :zero) + :one, " +
      "history = list_append(history, :entry) " +
      "ADD tags :added",
    ExpressionAttributeValues: {
      ":zero": { N: "0" },
      ":one": { N: "1" },
      ":entry": { L: [{ S: "viewed" }] },
      ":added": { SS: ["published"] },
    },
    ReturnValues: "UPDATED_NEW",
  }),
);

// UPDATED_NEW answers with the attributes the expression touched.
console.log(counted.Attributes?.["views"]?.N); // "1"
console.log(counted.Attributes?.["history"]?.L?.length); // 2
console.log(counted.Attributes?.["tags"]?.SS); // [ "draft", "published" ]
console.log(counted.Attributes?.["pageId"]); // undefined

// Two actions cannot write to one attribute, so taking a tag away is its own
// update rather than a DELETE alongside the ADD above.
const untagged = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { pageId: { S: "page-1" } },
    UpdateExpression: "DELETE tags :gone",
    ExpressionAttributeValues: { ":gone": { SS: ["draft"] } },
    ReturnValues: "UPDATED_NEW",
  }),
);

console.log(untagged.Attributes?.["tags"]?.SS); // [ "published" ]
