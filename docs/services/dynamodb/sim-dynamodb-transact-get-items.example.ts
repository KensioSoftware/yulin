/**
 * Reading two items in one step, one of which is not there.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  TransactGetItemsCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "AccountsTable",
    KeySchema: [{ AttributeName: "accountId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "accountId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "AccountsTable",
    Item: {
      accountId: { S: "account-1" },
      balance: { N: "100" },
      status: { S: "open" },
    },
  }),
);

const output = await dynamoDb.transactGetItems(
  new TransactGetItemsCommand({
    TransactItems: [
      {
        Get: {
          TableName: "AccountsTable",
          Key: { accountId: { S: "account-1" } },
          ProjectionExpression: "balance",
        },
      },
      {
        Get: {
          TableName: "AccountsTable",
          Key: { accountId: { S: "account-404" } },
        },
      },
    ],
  }),
);

// Responses is positional and is never compacted, so a missing item is an
// entry with no Item rather than nothing at all.
console.log(output.Responses[0]); // { Item: { balance: { N: "100" } } }
console.log(output.Responses[1]); // {}
