/**
 * A topic policy admitting S3 to publish to a topic, for one Bucket only.
 */

import {
  CreateTopicCommand,
  PublishCommand,
  SetTopicAttributesCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();
const topicArn = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await sns.setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "SNS:Publish",
          Resource: topicArn,
          Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
        },
      ],
    }),
  }),
);

// S3 has no identity policies anywhere, so the topic policy is the whole
// decision. What it is publishing for goes in as aws:SourceArn.
const s3 = { kind: "service", service: "s3.amazonaws.com" } as const;

const published = await sns.publish(
  new PublishCommand({ TopicArn, Message: "uploads/order-1.json" }),
  { caller: s3, sourceArn: "arn:aws:s3:::uploads" },
);

console.log(published.MessageId !== undefined); // true

// A Bucket the condition does not cover is refused.
try {
  await sns.publish(
    new PublishCommand({ TopicArn, Message: "reports/order-1.json" }),
    { caller: s3, sourceArn: "arn:aws:s3:::reports" },
  );
} catch (error) {
  console.log((error as Error).name); // "AuthorizationErrorException"
}
