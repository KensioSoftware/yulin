/**
 * A message that was received but never deleted, coming back once its
 * visibility timeout lapses.
 */

import {
  CreateQueueCommand,
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

const first = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(first.Messages?.length); // 1

// The message is invisible to everyone else while the timeout runs.
const empty = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(empty.Messages); // undefined

await simAws.clock().advanceBy({ seconds: 31 });

const again = await sqs.receiveMessage(
  new ReceiveMessageCommand({
    QueueUrl,
    MessageSystemAttributeNames: ["ApproximateReceiveCount"],
  }),
);

console.log(again.Messages?.[0]?.Attributes?.["ApproximateReceiveCount"]); // "2"
