/**
 * Sending an event a target refused to its dead-letter queue.
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
const dlqArn = "arn:aws:sqs:us-east-1:888888888888:undelivered-orders";

// A dead-letter queue admitting EventBridge for the rule.
const { QueueUrl } = await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "undelivered-orders" }));
await simAws.sqs().setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "events.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: dlqArn,
            Condition: {
              ArnEquals: {
                "aws:SourceArn":
                  "arn:aws:events:us-east-1:888888888888:rule/orders",
              },
            },
          },
        ],
      }),
    },
  }),
);

// A target queue that was never created, so every delivery fails.
await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);
await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [
      {
        Id: "fulfilment",
        Arn: "arn:aws:sqs:us-east-1:888888888888:fulfilment",
        RetryPolicy: { MaximumRetryAttempts: 2 },
        DeadLetterConfig: { Arn: dlqArn },
      },
    ],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
    ],
  }),
);
await simAws.backgroundTasksComplete();

const { Messages } = await simAws
  .sqs()
  .receiveMessage(
    new ReceiveMessageCommand({ QueueUrl, MessageAttributeNames: ["All"] }),
  );

console.log(Messages?.[0]?.MessageAttributes?.["ERROR_CODE"]?.StringValue);
// "NO_RESOURCE"
