/**
 * Items expiring as the simulated clock moves past their time to live.
 */

import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-01T09:00:00.000Z")),
});
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "SessionsTable",
    KeySchema: [{ AttributeName: "sessionId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "sessionId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

await dynamoDb.updateTimeToLive(
  new UpdateTimeToLiveCommand({
    TableName: "SessionsTable",
    TimeToLiveSpecification: { Enabled: true, AttributeName: "expiresAt" },
  }),
);
await simAws.backgroundTasksComplete();

const described = await dynamoDb.describeTimeToLive(
  new DescribeTimeToLiveCommand({ TableName: "SessionsTable" }),
);

console.log(described.TimeToLiveDescription?.TimeToLiveStatus); // "ENABLED"

// A session that expires in an hour.
const nowSeconds = Math.floor(simAws.now().getTime() / 1000);

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "SessionsTable",
    Item: {
      sessionId: { S: "abc" },
      expiresAt: { N: String(nowSeconds + 3600) },
    },
  }),
);

await simAws.clock().advanceBy({ hours: 2 });

const stale = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "SessionsTable",
    Key: { sessionId: { S: "abc" } },
  }),
);

// Expired an hour ago, and still there, as it would be on AWS.
console.log(stale.Item === undefined); // false

await simAws.clock().advanceBy({ days: 3 });

const collected = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "SessionsTable",
    Key: { sessionId: { S: "abc" } },
  }),
);

// Past the deletion window, with nothing else asked of the simulation.
console.log(collected.Item === undefined); // true
