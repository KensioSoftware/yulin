/**
 * A simulated table that is protected from deletion.
 */

import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "ProtectedTable",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    DeletionProtectionEnabled: true,
  }),
);
await simAws.backgroundTasksComplete();

try {
  await dynamoDb.deleteTable(
    new DeleteTableCommand({ TableName: "ProtectedTable" }),
  );
} catch (error) {
  if ((error as Error).name !== "ValidationException") {
    throw error;
  }
  console.log("the table is protected from deletion");
}

const description = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "ProtectedTable" }),
);

console.log(description.Table?.TableStatus); // "ACTIVE"
