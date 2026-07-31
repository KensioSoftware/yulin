/**
 * Creating a simulated on-demand table.
 */

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

const creation = await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

console.log(creation.TableDescription?.TableStatus); // "CREATING"
console.log(creation.TableDescription?.KeySchema?.[0]?.AttributeName); // "id"

// The table becomes ACTIVE once the scheduled background work has run.
await simAws.backgroundTasksComplete();
