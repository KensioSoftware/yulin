/**
 * Finding out why a target received nothing.
 */

import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// A queue with no policy admitting EventBridge.
await simAws.sqs().createQueue(new CreateQueueCommand({ QueueName: "orders" }));

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);
await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [{ Id: "q", Arn: "arn:aws:sqs:us-east-1:888888888888:orders" }],
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

const [failure] = simAws.eventBridge().deliveryFailures;

console.log(failure?.targetId); // "q"
console.log(failure?.message);
// "The queue policy of arn:aws:sqs:... does not allow events.amazonaws.com..."
