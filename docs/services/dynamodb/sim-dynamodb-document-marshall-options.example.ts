/**
 * Writing a partly filled object through a document client that drops
 * undefined values.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
  { marshallOptions: { removeUndefinedValues: true } },
);
simSdk.intercept(documents);

await documents.send(
  new CreateTableCommand({
    TableName: "PagesTable",
    KeySchema: [{ AttributeName: "pageId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "pageId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

// The summary was never filled in, and one section is still to be written.
await documents.send(
  new PutCommand({
    TableName: "PagesTable",
    Item: {
      pageId: "page-1",
      meta: { title: "Home", summary: undefined },
      sections: ["intro", undefined, "outro"],
    },
  }),
);

const read = await documents.send(
  new GetCommand({ TableName: "PagesTable", Key: { pageId: "page-1" } }),
);

const meta = read.Item?.["meta"] as Record<string, string>;
console.log(Object.keys(meta)); // [ 'title' ]

// A dropped member takes its position with it.
const sections = read.Item?.["sections"] as string[];
console.log(sections); // [ 'intro', 'outro' ]
