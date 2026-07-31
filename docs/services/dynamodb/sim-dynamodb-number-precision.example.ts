/**
 * A number too large for a JavaScript number, kept whole.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "CountersTable",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "CountersTable",
    Item: { id: { S: "counter" }, count: { N: "9007199254740993" } },
  }),
);

const replaced = await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "CountersTable",
    Item: { id: { S: "counter" }, count: { N: "9007199254740994" } },
    ReturnValues: "ALL_OLD",
  }),
);

// A JavaScript number would have rounded this to 9007199254740992.
console.log(replaced.Attributes?.["count"]?.N); // "9007199254740993"
