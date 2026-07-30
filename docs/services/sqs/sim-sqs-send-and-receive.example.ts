/**
 * Sending a message to a simulated queue and receiving it.
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
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl }),
);
const message = received.Messages?.[0];

console.log(message?.Body); // "order-1"

await sqs.deleteMessage(
  new DeleteMessageCommand({
    QueueUrl,
    ReceiptHandle: message?.ReceiptHandle,
  }),
);
