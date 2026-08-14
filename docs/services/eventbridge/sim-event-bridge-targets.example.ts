/**
 * A rule sending order events to a queue.
 */

import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

const queue = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

// The queue's own policy is what admits EventBridge.
await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl: queue.QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "events.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
          },
        ],
      }),
    },
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [{ Id: "orders-queue", Arn: queueArn }],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

// Delivery happens after PutEvents has answered, as it does on real AWS.
await simAws.backgroundTasksComplete();

const received = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue.QueueUrl }));

console.log(received.Messages?.length); // 1
