/**
 * Deploying a queue from a CloudFormation template and sending to it.
 */

import { SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: "orders",
          VisibilityTimeout: 120,
          MessageRetentionPeriod: 3600,
        },
      },
    },
    Outputs: {
      OrdersQueueUrl: {
        Value: { Ref: "OrdersQueue" },
      },
      OrdersQueueArn: {
        Value: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
      },
    },
  },
});

await stack.waitForDeployComplete();

// Ref resolves to the queue URL, so it works as a SendMessage QueueUrl.
const queueUrl = stack.outputs.get("OrdersQueueUrl")?.value as string;

await simAws
  .sqs()
  .sendMessage(
    new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
  );

console.log(stack.outputs.get("OrdersQueueArn")?.value);
// "arn:aws:sqs:us-east-1:888888888888:orders"
