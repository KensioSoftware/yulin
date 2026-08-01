/**
 * Writing a ledger entry and the balance it moves, or writing neither.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
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
await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "LedgerTable",
    KeySchema: [{ AttributeName: "entryId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "entryId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

// The account is closed, so the balance may not move.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "AccountsTable",
    Item: {
      accountId: { S: "account-1" },
      balance: { N: "100" },
      status: { S: "closed" },
    },
  }),
);

const ledgerEntry = {
  Put: {
    TableName: "LedgerTable",
    Item: { entryId: { S: "entry-1" }, amount: { N: "25" } },
  },
};

const balanceUpdate = {
  Update: {
    TableName: "AccountsTable",
    Key: { accountId: { S: "account-1" } },
    UpdateExpression: "SET balance = balance - :amount",
    ConditionExpression: "#status = :open",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":amount": { N: "25" },
      ":open": { S: "open" },
    },
  },
};

try {
  await dynamoDb.transactWriteItems(
    new TransactWriteItemsCommand({
      TransactItems: [ledgerEntry, balanceUpdate],
    }),
  );
} catch (error) {
  const cancelled = error as {
    name: string;
    CancellationReasons?: { Code: string; Message?: string }[];
  };

  console.log(cancelled.name); // "TransactionCanceledException"
  console.log(cancelled.CancellationReasons);
  // [
  //   { Code: "None" },
  //   {
  //     Code: "ConditionalCheckFailed",
  //     Message: "The conditional request failed.",
  //   },
  // ]
}

// The first action is reported even though nothing was wrong with it, and the
// ledger entry it would have written is not there.
const entry = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "LedgerTable",
    Key: { entryId: { S: "entry-1" } },
  }),
);

console.log(entry.Item); // undefined
