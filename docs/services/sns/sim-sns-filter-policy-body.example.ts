/**
 * Filtering on a nested key of the published message body.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const sqs = simAws.sqs();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);
const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "gold-orders" }),
);
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:gold-orders`;

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnEquals: { "aws:SourceArn": TopicArn } },
          },
        ],
      }),
    },
  }),
);

await sns.subscribe(
  new SubscribeCommand({
    TopicArn,
    Protocol: "sqs",
    Endpoint: queueArn,
    Attributes: {
      FilterPolicyScope: "MessageBody",
      FilterPolicy: JSON.stringify({
        customer: { tier: ["gold"] },
        amount: [{ numeric: [">", 100] }],
      }),
    },
  }),
);

for (const body of [
  { customer: { tier: "silver" }, amount: 500 },
  { customer: { tier: "gold" }, amount: 500 },
]) {
  await sns.publish(
    new PublishCommand({ TopicArn, Message: JSON.stringify(body) }),
  );
}

await simAws.backgroundTasksComplete();

const { Messages } = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 10 }),
);

console.log(Messages?.length); // 1
