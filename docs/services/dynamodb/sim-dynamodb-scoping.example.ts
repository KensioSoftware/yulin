/**
 * The same table name in two Accounts, or two Regions, is two tables.
 */

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const tableInput = {
  TableName: "FoobarTable",
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" as const }],
  AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" as const }],
  BillingMode: "PAY_PER_REQUEST" as const,
};

// Two Accounts, one Region.
const firstAccount = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .dynamoDb()
  .createTable(new CreateTableCommand(tableInput));

const secondAccount = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .dynamoDb()
  .createTable(new CreateTableCommand(tableInput));

console.log(firstAccount.TableDescription?.TableArn);
// "arn:aws:dynamodb:eu-west-2:111111111111:table/FoobarTable"
console.log(secondAccount.TableDescription?.TableArn);
// "arn:aws:dynamodb:eu-west-2:222222222222:table/FoobarTable"

// One Account, two Regions.
const otherRegion = await simAws
  .account("111111111111")
  .region("us-east-1")
  .dynamoDb()
  .createTable(new CreateTableCommand(tableInput));

console.log(otherRegion.TableDescription?.TableArn);
// "arn:aws:dynamodb:us-east-1:111111111111:table/FoobarTable"

await simAws.backgroundTasksComplete();
