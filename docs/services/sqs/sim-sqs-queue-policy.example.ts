/**
 * A queue policy admitting S3 to send to a queue, for one Bucket only.
 */

import {
  CreateQueueCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
          },
        ],
      }),
    },
  }),
);

// S3 has no identity policies anywhere, so the queue policy is the whole
// decision. What it is sending for goes in as aws:SourceArn.
const s3 = { kind: "service", service: "s3.amazonaws.com" } as const;

const sent = await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl, MessageBody: "uploads/order-1.json" }),
  { caller: s3, sourceArn: "arn:aws:s3:::uploads" },
);

console.log(sent.MessageId !== undefined); // true

// A Bucket the condition does not cover is refused.
try {
  await sqs.sendMessage(
    new SendMessageCommand({ QueueUrl, MessageBody: "reports/order-1.json" }),
    { caller: s3, sourceArn: "arn:aws:s3:::reports" },
  );
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
