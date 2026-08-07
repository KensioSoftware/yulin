/**
 * Two queues on one topic, each taking the messages its policy names.
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
 * Subscribe a queue that admits SNS, with a filter policy of its own.
 */
async function subscribeQueue(
  queueName: string,
  filterPolicy: unknown,
): Promise<string> {
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
      Attributes: { FilterPolicy: JSON.stringify(filterPolicy) },
    }),
  );

  return QueueUrl ?? "";
}

const orders = await subscribeQueue("order-handling", { type: ["order"] });
const refunds = await subscribeQueue("refund-handling", { type: ["refund"] });

await sns.publish(
  new PublishCommand({
    TopicArn,
    Message: "order-1",
    MessageAttributes: { type: { DataType: "String", StringValue: "order" } },
  }),
);

await simAws.backgroundTasksComplete();

const delivered = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: orders }),
);
const filtered = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: refunds }),
);

console.log(delivered.Messages?.length); // 1
console.log(filtered.Messages); // undefined
