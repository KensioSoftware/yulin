/**
 * Deploying a table with a stream from a CloudFormation template.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "orderId", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
        },
      },
    },
    Outputs: {
      OrdersStreamArn: {
        Value: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// The Output holds the ARN of the stream the deployed table captures on.
const streamArn = stack.output("OrdersStreamArn");

console.log(streamArn.includes("/stream/")); // true

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);

// The write is on the stream, read the way any consumer reads it.
const dynamoDbStreams = simAws.dynamoDbStreams();

const described = await dynamoDbStreams.describeStream(
  new DescribeStreamCommand({ StreamArn: streamArn }),
);

const iterator = await dynamoDbStreams.getShardIterator(
  new GetShardIteratorCommand({
    StreamArn: streamArn,
    ShardId: described.StreamDescription?.Shards?.[0]?.ShardId,
    ShardIteratorType: "TRIM_HORIZON",
  }),
);

const read = await dynamoDbStreams.getRecords(
  new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
);

console.log(read.Records?.[0]?.eventName); // "INSERT"
