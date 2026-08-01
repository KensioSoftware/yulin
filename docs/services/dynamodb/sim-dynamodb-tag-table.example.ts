/**
 * Tagging a table on creation and afterwards, and reading the tags back.
 */

import {
  CreateTableCommand,
  ListTagsOfResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

const creation = await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    Tags: [{ Key: "Environment", Value: "test" }],
  }),
);
await simAws.backgroundTasksComplete();

const tableArn = creation.TableDescription?.TableArn ?? "";

await dynamoDb.tagResource(
  new TagResourceCommand({
    ResourceArn: tableArn,
    Tags: [
      { Key: "Owner", Value: "platform" },
      // A key that is already there has its value replaced.
      { Key: "Environment", Value: "staging" },
    ],
  }),
);

await dynamoDb.untagResource(
  new UntagResourceCommand({ ResourceArn: tableArn, TagKeys: ["Owner"] }),
);

const { Tags } = await dynamoDb.listTagsOfResource(
  new ListTagsOfResourceCommand({ ResourceArn: tableArn }),
);

console.log(Tags); // [{ Key: "Environment", Value: "staging" }]
