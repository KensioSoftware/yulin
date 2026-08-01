/**
 * Paging through an item collection until the token runs out.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "EventsTable",
    KeySchema: [
      { AttributeName: "streamId", KeyType: "HASH" },
      { AttributeName: "eventId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "streamId", AttributeType: "S" },
      { AttributeName: "eventId", AttributeType: "N" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

for (const eventId of ["1", "2", "3"]) {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "EventsTable",
      Item: { streamId: { S: "stream-1" }, eventId: { N: eventId } },
    }),
  );
}

const read: string[] = [];
let exclusiveStartKey: Record<string, AttributeValue> | undefined;

do {
  const page = await dynamoDb.query(
    new QueryCommand({
      TableName: "EventsTable",
      KeyConditionExpression: "streamId = :stream",
      ExpressionAttributeValues: { ":stream": { S: "stream-1" } },
      Limit: 2,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  read.push(...(page.Items ?? []).map((item) => item["eventId"]?.N ?? ""));
  exclusiveStartKey = page.LastEvaluatedKey;
} while (exclusiveStartKey !== undefined);

console.log(read); // [ "1", "2", "3" ]
