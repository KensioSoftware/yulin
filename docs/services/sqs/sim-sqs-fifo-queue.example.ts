/**
 * A FIFO queue holding back a message group while one of its messages is in
 * flight, and deduplicating a retried send.
 */

import {
  CreateQueueCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  type SendMessageCommandOutput,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders.fifo",
    Attributes: { FifoQueue: "true", ContentBasedDeduplication: "true" },
  }),
);

const placeOrder = async (
  customer: string,
  order: string,
): Promise<SendMessageCommandOutput> =>
  await sqs.sendMessage(
    new SendMessageCommand({
      QueueUrl,
      MessageBody: order,
      MessageGroupId: customer,
    }),
  );

const first = await placeOrder("customer-1", "order-1");
await placeOrder("customer-1", "order-2");
await placeOrder("customer-2", "order-3");

// A retry inside five minutes is the same message, under the same id.
const retried = await placeOrder("customer-1", "order-1");

console.log(retried.MessageId === first.MessageId); // true

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 1 }),
);

console.log(received.Messages?.[0]?.Body); // "order-1"

// While order-1 is in flight, customer-1's next order waits behind it.
const meanwhile = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 10 }),
);

console.log(meanwhile.Messages?.map((message) => message.Body)); // ["order-3"]

await sqs.deleteMessage(
  new DeleteMessageCommand({
    QueueUrl,
    ReceiptHandle: received.Messages?.[0]?.ReceiptHandle,
  }),
);

const next = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(next.Messages?.[0]?.Body); // "order-2"
