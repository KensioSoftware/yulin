/**
 * Tagging a queue and deciding a send on its tags.
 */

import {
  CreateQueueCommand,
  ListQueueTagsCommand,
  SendMessageCommand,
  TagQueueCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const created = await simAws.sqs().createQueue(
  new CreateQueueCommand({
    QueueName: "orders",
    tags: { team: "orders" },
  }),
);

await simAws.sqs().tagQueue(
  new TagQueueCommand({
    QueueUrl: created.QueueUrl,
    Tags: { stage: "test" },
  }),
);

const listed = await simAws
  .sqs()
  .listQueueTags(new ListQueueTagsCommand({ QueueUrl: created.QueueUrl }));

console.log(listed.Tags); // { team: 'orders', stage: 'test' }

await simAws.iam().createRole({
  input: {
    RoleName: "OrdersSender",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "OrdersSender",
    PolicyName: "SendToOwnTeam",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sqs:SendMessage",
        Resource: "*",
        Condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
    }),
  },
});

const sent = await simAws
  .sqs()
  .sendMessage(
    new SendMessageCommand({ QueueUrl: created.QueueUrl, MessageBody: "hi" }),
    {
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:role/OrdersSender",
      },
    },
  );

console.log(typeof sent.MessageId); // "string"
