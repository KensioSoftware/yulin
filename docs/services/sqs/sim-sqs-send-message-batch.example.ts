/**
 * A batch send where one entry fails on its own.
 */

import {
  CreateQueueCommand,
  SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    Attributes: { MaximumMessageSize: "1024" },
  }),
);

const sent = await sqs.sendMessageBatch(
  new SendMessageBatchCommand({
    QueueUrl,
    Entries: [
      { Id: "one", MessageBody: "order-1" },
      { Id: "two", MessageBody: "x".repeat(2048) },
    ],
  }),
);

console.log(sent.Successful?.map((entry) => entry.Id)); // ["one"]
console.log(sent.Failed?.[0]?.Code); // "InvalidParameterValue"
