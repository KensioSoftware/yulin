/**
 * Pausing a simulated queue mapping, then resuming it with a smaller batch.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  UpdateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

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

const batchSizes: number[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaSqsEvent) => {
        batchSizes.push(event.Records.length);
      }),
    },
  }),
);

const { UUID } = await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "order-consumer",
  }),
);

// A mapping refuses changes until it has finished being created.
await simAws.backgroundTasksComplete();

await simAws
  .lambda()
  .updateEventSourceMapping(
    new UpdateEventSourceMappingCommand({ UUID, Enabled: false }),
  );
await simAws.backgroundTasksComplete();

for (const body of ["order-1", "order-2"]) {
  await simAws
    .sqs()
    .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: body }));
}

await simAws.lambda().updateEventSourceMapping(
  new UpdateEventSourceMappingCommand({
    UUID,
    Enabled: true,
    BatchSize: 1,
  }),
);
await simAws.backgroundTasksComplete();

console.log(batchSizes); // [1, 1]
