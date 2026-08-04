/**
 * Reading a table's captured changes back off its stream.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-dynamodb-streams";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();
const dynamoDbStreams = simAws.dynamoDbStreams();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);

const listed = await dynamoDbStreams.listStreams(
  new ListStreamsCommand({ TableName: "OrdersTable" }),
);
const streamArn = listed.Streams?.[0]?.StreamArn;

const described = await dynamoDbStreams.describeStream(
  new DescribeStreamCommand({ StreamArn: streamArn }),
);
const shardId = described.StreamDescription?.Shards?.[0]?.ShardId;

console.log(described.StreamDescription?.StreamStatus); // "ENABLED"

const iterator = await dynamoDbStreams.getShardIterator(
  new GetShardIteratorCommand({
    StreamArn: streamArn,
    ShardId: shardId,
    ShardIteratorType: "TRIM_HORIZON",
  }),
);

const read = await dynamoDbStreams.getRecords(
  new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
);

console.log(read.Records?.[0]?.eventName); // "INSERT"
console.log(read.Records?.[0]?.dynamodb?.NewImage?.["total"]?.N); // "101"

// The iterator to poll with next, which is there while the stream is open.
console.log(read.NextShardIterator !== undefined); // true
