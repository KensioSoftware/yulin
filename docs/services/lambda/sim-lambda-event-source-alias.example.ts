/**
 * An event source mapping onto an alias, polling for the version it points at.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateAliasCommand,
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderConsumerRole",
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
    RoleName: "OrderConsumerRole",
    PolicyName: "ConsumeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "handled";
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "order-consumer" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "order-consumer",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

const mapping = await lambda.createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "order-consumer:live",
  }),
);

console.log(mapping.FunctionArn); // ...:function:order-consumer:live

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));
await simAws.backgroundTasksComplete();
