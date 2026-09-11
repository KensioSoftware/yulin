/**
 * Delivering only the queue messages a filter matches.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
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
    RoleName: "ShippedOrdersRole",
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
    RoleName: "ShippedOrdersRole",
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

const shipped: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "shipped-orders",
    Role: role.Role.Arn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimLambdaSqsEvent) => {
        for (const record of event.Records) {
          shipped.push(
            (JSON.parse(record.body) as { orderId: string }).orderId,
          );
        }
      }),
    },
  }),
);

await simAws.lambda().createEventSourceMapping(
  new CreateEventSourceMappingCommand({
    EventSourceArn: queueArn,
    FunctionName: "shipped-orders",
    FilterCriteria: {
      Filters: [{ Pattern: JSON.stringify({ body: { status: ["shipped"] } }) }],
    },
  }),
);

for (const order of [
  { orderId: "order-1", status: "placed" },
  { orderId: "order-2", status: "shipped" },
]) {
  await simAws
    .sqs()
    .sendMessage(
      new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(order) }),
    );
}

await simAws.backgroundTasksComplete();

console.log(shipped); // ["order-2"]
