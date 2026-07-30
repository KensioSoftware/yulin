/**
 * A message that cannot be received until the delay it was sent with lapses.
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
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.sendMessage(
  new SendMessageCommand({
    QueueUrl,
    MessageBody: "order-1",
    DelaySeconds: 60,
  }),
);

const early = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(early.Messages); // undefined

await simAws.clock().advanceBy({ seconds: 61 });

const late = await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(late.Messages?.[0]?.Body); // "order-1"
