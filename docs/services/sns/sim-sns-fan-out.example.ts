/**
 * Publishing once and having two queues each receive a copy.
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

/**
 * Create a queue that admits SNS to send to it for this topic, and subscribe
 * it. The queue policy is what allows the delivery, and it is checked on every
 * message rather than remembered from subscribe time.
 */
async function subscribeQueue(queueName: string): Promise<string> {
  const { QueueUrl } = await sqs.createQueue(
    new CreateQueueCommand({ QueueName: queueName }),
  );
  const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:${queueName}`;

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
              Condition: { ArnLike: { "aws:SourceArn": TopicArn } },
            },
          ],
        }),
      },
    }),
  );

  await sns.subscribe(
    new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
  );

  return QueueUrl ?? "";
}

const fulfilment = await subscribeQueue("fulfilment");
const audit = await subscribeQueue("audit");

await sns.publish(new PublishCommand({ TopicArn, Message: "order-1" }));

// Delivery happens after the publish is answered, as it does on real SNS.
await simAws.backgroundTasksComplete();

for (const QueueUrl of [fulfilment, audit]) {
  const { Messages } = await sqs.receiveMessage(
    new ReceiveMessageCommand({ QueueUrl }),
  );
  const envelope = JSON.parse(Messages?.[0]?.Body ?? "{}") as {
    Type: string;
    Message: string;
  };

  console.log(envelope.Type); // "Notification"
  console.log(envelope.Message); // "order-1"
}
