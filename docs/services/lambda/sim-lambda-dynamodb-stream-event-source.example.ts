/**
 * Delivering a simulated table's changes to a simulated function.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaDynamoDbStreamEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();

const { TableDescription } = await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "orders",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);

const streamArn = TableDescription?.LatestStreamArn;

// The projection goes into a second table. A function writing back into the
// table whose stream invoked it would be delivered its own writes, which the
// simulator refuses rather than looping on.
await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "order-totals",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

// The execution role needs the three stream actions Lambda reads a stream
// with, plus ListStreams, which is on every stream rather than on one, and
// whatever the function itself does.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderProjectorRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrderProjectorRole",
    PolicyName: "ProjectOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:DescribeStream",
            "dynamodb:GetRecords",
            "dynamodb:GetShardIterator",
          ],
          Resource: streamArn,
        },
        { Effect: "Allow", Action: "dynamodb:ListStreams", Resource: "*" },
        {
          Effect: "Allow",
          Action: "dynamodb:PutItem",
          Resource: `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/order-totals`,
        },
      ],
    }),
  }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-projector",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        async (event: SimLambdaDynamoDbStreamEvent) => {
          await Promise.all(
            event.Records.map(async (record) =>
              simAws.dynamoDb().putItem(
                new PutItemCommand({
                  TableName: "order-totals",
                  Item: {
                    orderId: { S: record.dynamodb.Keys?.["orderId"]?.S ?? "" },
                    total: { N: record.dynamodb.NewImage?.["total"]?.N ?? "0" },
                  },
                }),
              ),
            ),
          );
        },
      ),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: streamArn,
    FunctionName: "order-projector",
    StartingPosition: "TRIM_HORIZON",
  }),
);

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "42" } },
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();

const projected = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "order-totals",
    Key: { orderId: { S: "order-1" } },
  }),
);

console.log(projected.Item?.["total"]?.N); // "42"
