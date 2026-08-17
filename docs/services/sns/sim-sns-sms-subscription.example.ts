/**
 * Fanning a published message out to a subscribed phone number.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "alerts" }),
);

// An sms subscription needs no confirmation either, so the ARN comes back at
// once.
const { SubscriptionArn } = await sns.subscribe(
  new SubscribeCommand({
    TopicArn,
    Protocol: "sms",
    Endpoint: "+15550100",
    Attributes: { FilterPolicy: JSON.stringify({ severity: ["high"] }) },
  }),
);

await sns.publish(
  new PublishCommand({
    TopicArn,
    Subject: "Disk usage",
    Message: "Disk full",
    MessageAttributes: {
      severity: { DataType: "String", StringValue: "high" },
    },
  }),
);

// A topic delivers after the publish has been answered, as it does on real
// SNS.
await simAws.backgroundTasksComplete();

const [sms] = sns.sentSmsMessages();

console.log(sms?.phoneNumber); // "+15550100"
console.log(sms?.message); // "Disk full"
console.log(sms?.topicArn === TopicArn); // true
console.log(sms?.subscriptionArn === SubscriptionArn); // true
console.log(sms?.suppressed); // false
