/**
 * Verifying the signature on a message a simulated topic delivered.
 */

import { createVerify } from "node:crypto";

import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const sqs = simAws.sqs();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);
const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

await sqs.setQueueAttributes(
  new SetQueueAttributesCommand({
    QueueUrl,
    Attributes: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "sns.amazonaws.com" },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: { ArnLike: { "aws:SourceArn": TopicArn } },
          },
        ],
      }),
    },
  }),
);

await sns.subscribe(
  new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
);

await sns.publish(new PublishCommand({ TopicArn, Message: "order-1" }));
await simAws.backgroundTasksComplete();

const { Messages } = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl }),
);
const envelope = JSON.parse(Messages?.[0]?.Body ?? "{}") as {
  Type: string;
  MessageId: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  TopicArn: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
};

// The string SNS signs is the signed fields in alphabetical order, each one its
// name and its value followed by a newline. A field the message does not carry,
// such as Subject, is left out.
const signed = (
  [
    ["Message", envelope.Message],
    ["MessageId", envelope.MessageId],
    ["Subject", envelope.Subject],
    ["Timestamp", envelope.Timestamp],
    ["TopicArn", envelope.TopicArn],
    ["Type", envelope.Type],
  ] as const
)
  .filter(([, value]) => value !== undefined)
  .map(([name, value]) => `${name}\n${value ?? ""}\n`)
  .join("");

// The certificate comes from the simulator rather than from the network: the
// SigningCertURL names the simulated host and nothing serves it.
const certificate = sns.signingCertificate(envelope.SigningCertURL);

const verified = createVerify("RSA-SHA1")
  .update(signed, "utf8")
  .verify(certificate ?? "", envelope.Signature, "base64");

console.log(envelope.SignatureVersion); // "1"
console.log(verified); // true
