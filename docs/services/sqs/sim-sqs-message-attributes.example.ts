/**
 * Message attributes on a simulated queue, and asking for them back.
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

const sent = await sqs.sendMessage(
  new SendMessageCommand({
    QueueUrl,
    MessageBody: "order-1",
    MessageAttributes: {
      tenant: { DataType: "String", StringValue: "acme" },
      attempt: { DataType: "Number", StringValue: "1" },
    },
  }),
);

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl, MessageAttributeNames: ["All"] }),
);
const message = received.Messages?.[0];

console.log(message?.MessageAttributes?.["tenant"]?.StringValue); // "acme"
console.log(message?.MD5OfMessageAttributes === sent.MD5OfMessageAttributes); // true
console.log(message?.MD5OfBody === sent.MD5OfMessageBody); // true
