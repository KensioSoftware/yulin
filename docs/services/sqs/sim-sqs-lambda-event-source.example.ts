/**
 * A message sent to a queue reaching a Lambda through an event source mapping.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaSqsEvent,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();
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

// Lambda polls the queue as the execution role, so the role has to allow it.
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

const consumed: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaSqsEvent) => {
        for (const record of event.Records) {
          consumed.push(record.body);
        }
      }),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "order-consumer",
  }),
);

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

await simAws.backgroundTasksComplete();

console.log(consumed); // ["order-1"]

// The handler returned, so the message has been deleted from the queue.
const remaining = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(remaining.Messages); // undefined
