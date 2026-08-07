/**
 * Subscribing a queue to a simulated topic, and reading the subscription back.
 */

import {
  CreateTopicCommand,
  GetSubscriptionAttributesCommand,
  ListSubscriptionsByTopicCommand,
  SetSubscriptionAttributesCommand,
  SubscribeCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await simAws
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "order-consumer" }));

const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:order-consumer`;

// An sqs subscription needs no confirmation, so the ARN comes back at once
// rather than "pending confirmation".
const { SubscriptionArn } = await sns.subscribe(
  new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
);

console.log(SubscriptionArn?.startsWith(`${TopicArn ?? ""}:`)); // true

const listed = await sns.listSubscriptionsByTopic(
  new ListSubscriptionsByTopicCommand({ TopicArn }),
);

console.log(listed.Subscriptions?.[0]?.Endpoint === queueArn); // true

// The subscription reports what it is and how it delivers.
const read = await sns.getSubscriptionAttributes(
  new GetSubscriptionAttributesCommand({ SubscriptionArn }),
);

console.log(read.Attributes?.["PendingConfirmation"]); // "false"
console.log(read.Attributes?.["RawMessageDelivery"]); // "false"

await sns.setSubscriptionAttributes(
  new SetSubscriptionAttributesCommand({
    SubscriptionArn,
    AttributeName: "RawMessageDelivery",
    AttributeValue: "true",
  }),
);

await sns.unsubscribe(new UnsubscribeCommand({ SubscriptionArn }));

console.log(simAws.sns().topicSubscriptions("orders").length); // 0
