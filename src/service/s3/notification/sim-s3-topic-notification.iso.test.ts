import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SubscribeCommand } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  simSnsDeliveredMessage,
  simSnsQueuePolicy,
  simSnsSubscribedQueue,
} from "../../../../test/sns/subscription-fixture.js";
import { simS3NotificationTopic } from "../../../../test/s3/notification-topic-fixture.js";

const bucketArn = "arn:aws:s3:::uploads";

/**
 * The SNS envelope a subscribed queue receives, and the S3 event document
 * inside it.
 */
interface SnsEnvelope {
  readonly Subject?: string;
  readonly Message: string;
}

interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: {
        readonly configurationId: string;
        readonly bucket: { readonly name: string };
        readonly object: { readonly key: string; readonly size?: number };
      };
    },
  ];
}

/**
 * Read the S3 event document out of the envelope a queue received.
 */
function envelope(body: string | undefined): SnsEnvelope {
  assertNonNullable(body);

  return JSON.parse(body) as SnsEnvelope;
}

function eventDocument(received: SnsEnvelope): S3EventDocument {
  return JSON.parse(received.Message) as S3EventDocument;
}

/**
 * Configure a Bucket to notify a topic of created Objects.
 */
async function notifyTopic(
  simAws: SimAws,
  topicArn: string,
  id: string,
): Promise<void> {
  await simAws.s3().putBucketNotificationConfiguration(
    new PutBucketNotificationConfigurationCommand({
      Bucket: "uploads",
      NotificationConfiguration: {
        TopicConfigurations: [
          { Id: id, Events: ["s3:ObjectCreated:*"], TopicArn: topicArn },
        ],
      },
    }),
  );
}

describe("Notifying a simulated SNS topic of an Object event", () => {
  it("reaches a queue subscribed to the topic", async () => {
    // Given a topic admitting one Bucket, with a queue subscribed to it
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: bucketArn,
    });
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "uploads-queue",
      topicArn,
    );

    // And a Bucket configured to notify the topic
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await notifyTopic(simAws, topicArn, "raw-uploads");

    // When an Object is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );

    // Then the event travelled both hops, arriving as the S3 event document
    // inside the SNS envelope the queue's subscription wraps it in
    const received = envelope(await simSnsDeliveredMessage(simAws, queueUrl));
    assertIdentical(received.Subject, "Amazon S3 Notification");
    const document = eventDocument(received);
    assertArrayLength(document.Records, 1);
    assertIdentical(document.Records[0].eventName, "ObjectCreated:Put");
    assertIdentical(document.Records[0].s3.configurationId, "raw-uploads");
    assertIdentical(document.Records[0].s3.bucket.name, "uploads");
    const { key, size } = document.Records[0].s3.object;
    assertIdentical(key, "raw/cat.jpg");
    assertIdentical(size, 11);
  });

  it("publishes the document a removal produces", async () => {
    // Given a Bucket holding an Object, notifying a topic of removals
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: bucketArn,
    });
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "removals-queue",
      topicArn,
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          TopicConfigurations: [
            {
              Id: "removals",
              Events: ["s3:ObjectRemoved:*"],
              TopicArn: topicArn,
            },
          ],
        },
      }),
    );

    // When the Object is deleted
    await simAws
      .s3()
      .deleteObject(
        new DeleteObjectCommand({ Bucket: "uploads", Key: "raw/cat.jpg" }),
      );

    // Then the removal record arrives, carrying no size, as a real removal
    // record carries none
    const document = eventDocument(
      envelope(await simSnsDeliveredMessage(simAws, queueUrl)),
    );
    assertIdentical(document.Records[0].eventName, "ObjectRemoved:Delete");
    assertUndefined(document.Records[0].s3.object.size);
  });

  it("applies the object key filter to a topic destination", async () => {
    // Given a Bucket notifying a topic only about the raw/ prefix
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: bucketArn,
    });
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "uploads-queue",
      topicArn,
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          TopicConfigurations: [
            {
              Id: "raw-uploads",
              Events: ["s3:ObjectCreated:*"],
              TopicArn: topicArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] },
              },
            },
          ],
        },
      }),
    );

    // When an Object outside the prefix is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "thumbnails/cat.jpg",
        Body: "thumbnail",
      }),
    );

    // Then nothing is published, since the filter rules are the same whatever
    // the destination is
    assertUndefined(await simSnsDeliveredMessage(simAws, queueUrl));
  });

  it("reports a topic configuration back", async () => {
    // Given a Bucket notifying a topic
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: bucketArn,
    });
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await notifyTopic(simAws, topicArn, "raw-uploads");

    // When the configuration is read back
    const stored = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );

    // Then the topic group is reported alongside the others, at the top level
    // of the response rather than under NotificationConfiguration
    const configurations = stored.TopicConfigurations;
    assertNonNullable(configurations);
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].Id, "raw-uploads");
    assertIdentical(configurations[0].TopicArn, topicArn);
    assertUndefined(stored.QueueConfigurations);
  });

  it("notifies a topic in another Account that admits the Bucket", async () => {
    // Given a topic in another Account, admitting this Bucket
    const simAws = new SimAws();
    const otherAccountId = "222222222222";
    const topicArn = await simS3NotificationTopic(simAws, {
      accountId: otherAccountId,
      sourceArn: bucketArn,
    });

    // And a queue in that Account subscribed to it
    const otherScope = simAws
      .account(otherAccountId)
      .region(simAws.defaultRegionName);
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${otherAccountId}:uploads-queue`;
    const created = await otherScope
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "uploads-queue" }));
    await otherScope.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: { Policy: simSnsQueuePolicy(queueArn, topicArn) },
      }),
    );
    await otherScope.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
    );
    const queueUrl = created.QueueUrl ?? "";

    // And a Bucket in this Account configured to notify it
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await notifyTopic(simAws, topicArn, "uploads");

    // When an Object is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );

    // Then the event reached the other Account, since its own topic policy is
    // the grant and its own IAM evaluated it
    assertNonNullable(
      await simSnsDeliveredMessage(simAws, queueUrl, {
        accountId: otherAccountId,
      }),
    );
  });
});
