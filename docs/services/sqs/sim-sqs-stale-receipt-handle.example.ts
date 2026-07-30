/**
 * A slow consumer deleting with a receipt handle another receive has
 * superseded.
 */

import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: { VisibilityTimeout: "30" },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

const slow = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

// The slow consumer takes longer than the visibility timeout, and another
// consumer receives the message in the meantime.
await simAws.clock().advanceBy({ seconds: 31 });
await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

// The delete succeeds and deletes nothing.
await sqs.deleteMessage(
  new DeleteMessageCommand({
    QueueUrl,
    ReceiptHandle: slow.Messages?.[0]?.ReceiptHandle,
  }),
);

await simAws.clock().advanceBy({ seconds: 31 });

const still = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(still.Messages?.[0]?.Body); // "order-1"
