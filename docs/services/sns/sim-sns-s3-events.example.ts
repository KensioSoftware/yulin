/**
 * A topic taking S3 Object events and fanning them out to two queues.
 */

import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateTopicCommand,
  SetTopicAttributesCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

interface SnsEnvelope {
  Message: string;
}

interface S3EventDocument {
  Records: [{ s3: { object: { key: string } } }];
}

const simAws = new SimAws();
const { defaultRegionName: region, defaultAccountId: account } = simAws;
const topicArn = `arn:aws:sns:${region}:${account}:uploads`;

const { TopicArn } = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "uploads" }));

// S3 owns no identity policies, so the topic policy is the whole decision.
// The Bucket it is publishing for arrives as aws:SourceArn.
await simAws.sns().setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "Policy",
    AttributeValue: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sns:Publish",
          Resource: topicArn,
          Condition: { ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" } },
        },
      ],
    }),
  }),
);

/**
 * Subscribe a queue that admits SNS to send to it for this topic.
 */
async function subscribeQueue(queueName: string): Promise<string> {
  const { QueueUrl } = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: queueName }));
  const queueArn = `arn:aws:sqs:${region}:${account}:${queueName}`;

  await simAws.sqs().setQueueAttributes(
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
              Condition: { ArnLike: { "aws:SourceArn": topicArn } },
            },
          ],
        }),
      },
    }),
  );

  await simAws
    .sns()
    .subscribe(
      new SubscribeCommand({ TopicArn, Protocol: "sqs", Endpoint: queueArn }),
    );

  return QueueUrl ?? "";
}

const thumbnails = await subscribeQueue("thumbnails");
const audit = await subscribeQueue("audit");

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      TopicConfigurations: [
        { Id: "uploads", Events: ["s3:ObjectCreated:*"], TopicArn },
      ],
    },
  }),
);

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

await simAws.backgroundTasksComplete();

for (const QueueUrl of [thumbnails, audit]) {
  const received = await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));
  const envelope = JSON.parse(
    received.Messages?.[0]?.Body ?? "",
  ) as SnsEnvelope;
  const event = JSON.parse(envelope.Message) as S3EventDocument;

  console.log(event.Records[0].s3.object.key); // "raw/cat.jpg"
}
