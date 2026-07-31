/**
 * Creating a simulated provisioned table with a sort key.
 */

import { CreateTableCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const creation = await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderedAt", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderedAt", AttributeType: "N" },
    ],
    BillingMode: "PROVISIONED",
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 3 },
  }),
);

const throughput = creation.TableDescription?.ProvisionedThroughput;
console.log(throughput?.ReadCapacityUnits); // 5
console.log(throughput?.WriteCapacityUnits); // 3

await simAws.backgroundTasksComplete();
