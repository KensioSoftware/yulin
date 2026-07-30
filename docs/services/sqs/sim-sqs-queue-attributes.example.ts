/**
 * Reading the counts and settings of a simulated queue.
 */

import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: { VisibilityTimeout: "120" },
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
);
await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "order-2" }),
);
await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

const read = await sqs.getQueueAttributes(
  new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["All"] }),
);

console.log(read.Attributes?.["VisibilityTimeout"]); // "120"
console.log(read.Attributes?.["ApproximateNumberOfMessages"]); // "1"
console.log(read.Attributes?.["ApproximateNumberOfMessagesNotVisible"]); // "1"
console.log(read.Attributes?.["QueueArn"]); // "arn:aws:sqs:us-east-1:888888888888:orders"
