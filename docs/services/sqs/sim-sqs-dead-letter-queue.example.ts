/**
 * A message a consumer keeps failing on, ending up on the dead-letter queue.
 */

import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

// The dead-letter queue has to exist before anything can point at it.
const { QueueUrl: DeadLetterQueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders-dlq" }),
);

const deadLetter = await sqs.getQueueAttributes(
  new GetQueueAttributesCommand({
    QueueUrl: DeadLetterQueueUrl,
    AttributeNames: ["QueueArn"],
  }),
);

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: {
      VisibilityTimeout: "30",
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: deadLetter.Attributes?.["QueueArn"],
        maxReceiveCount: 3,
      }),
    },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

// A consumer takes the message and never gets as far as deleting it.
async function failToHandleMessage(): Promise<void> {
  await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));
  await simAws.clock().advanceBy({ seconds: 31 });
}

await failToHandleMessage();
await failToHandleMessage();
await failToHandleMessage();

// The source queue has given up on it.
const empty = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(empty.Messages); // undefined

const dead = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: DeadLetterQueueUrl }),
);

console.log(dead.Messages?.[0]?.Body); // "order-1"
