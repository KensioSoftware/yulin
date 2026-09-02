/**
 * Giving up on a stream batch once its retries have run out.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
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
    PolicyName: "ReadOrdersStream",
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
      ],
    }),
  }),
);

// The handler never gets through the batch, so the retries are what decide
// how many times it is given one.
const deliveries: SimLambdaDynamoDbStreamEvent[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-projector",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimLambdaDynamoDbStreamEvent): undefined => {
          deliveries.push(event);

          throw new Error("Projector could not handle the batch");
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
    MaximumRetryAttempts: 2,
    MaximumRecordAgeInSeconds: 120,
  }),
);

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: { orderId: { S: "order-1" }, total: { N: "42" } },
  }),
);

await simAws.backgroundTasksComplete();

// The two retries fall due 1 and 2 seconds after the deliveries they follow.
await simAws.clock().advanceBy({ seconds: 30 });

console.log(deliveries.length); // 3
