/**
 * A simulated Lambda handler consuming a message from a simulated queue.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

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
        Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
        Resource: `arn:aws:sqs:${regionName}:${accountId}:orders`,
      },
    }),
  }),
);

const handlerCode = [
  'const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");',
  "exports.handler = async () => {",
  "  const client = new SQSClient({});",
  "  const received = await client.send(new ReceiveMessageCommand({",
  "    QueueUrl: process.env.QUEUE_URL,",
  "  }));",
  "  const message = received.Messages[0];",
  "  await client.send(new DeleteMessageCommand({",
  "    QueueUrl: process.env.QUEUE_URL,",
  "    ReceiptHandle: message.ReceiptHandle,",
  "  }));",
  "  return message.Body;",
  "};",
].join("\n");

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: role.Role.Arn,
    Handler: "index.handler",
    Code: { ZipFile: makeLambdaCodeZip({ "index.js": handlerCode }) },
    Environment: { Variables: { QUEUE_URL: QueueUrl! } },
  }),
);

await simAws.backgroundTasksComplete();

const invoked = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "order-consumer" }));

console.log(Buffer.from(invoked.Payload ?? []).toString("utf8")); // "\"order-1\""
