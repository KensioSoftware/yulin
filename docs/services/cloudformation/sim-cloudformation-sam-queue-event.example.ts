/**
 * A SAM function fed by the queue its SQS event names.
 */

import { GetQueueUrlCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const received: string[][] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      OrdersQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders" },
      },
      Orders: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Work: {
              Type: "SQS",
              Properties: {
                Queue: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
                BatchSize: 5,
              },
            },
          },
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Orders",
      handler: (event: { Records: readonly { body: string }[] }): string[] => {
        const bodies = event.Records.map((record) => record.body);
        received.push(bodies);

        return bodies;
      },
    },
  ],
});

await stack.waitForDeployComplete();

const { QueueUrl } = await simAws
  .sqs()
  .getQueueUrl(new GetQueueUrlCommand({ QueueName: "orders" }));

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

await simAws.backgroundTasksComplete();

console.log(received);
