import {
  CreateBucketCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SetTopicAttributesCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../../../test/sns/subscription-fixture.js";
import {
  simS3NotificationTopic,
  simS3TopicPolicy,
} from "../../../../../../test/s3/notification-topic-fixture.js";

const bucketArn = "arn:aws:s3:::uploads";

/**
 * Configure a Bucket to notify a topic, answering with whatever it threw.
 */
async function notifyTopicRefusal(
  simAws: SimAws,
  topicArn: string,
): Promise<Error> {
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

  return assertThrowsErrorAsync(async () =>
    simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          TopicConfigurations: [
            { Events: ["s3:ObjectCreated:*"], TopicArn: topicArn },
          ],
        },
      }),
    ),
  );
}

describe("What a simulated SNS notification destination refuses", () => {
  it("refuses a topic whose policy admits nothing", async () => {
    // Given a topic with no policy at all
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws);

    // When a Bucket is configured to notify it
    const error = await notifyTopicRefusal(simAws, topicArn);

    // Then it is refused, since a service principal owns no identity policies
    // and the topic policy is the whole decision
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "does not allow s3.amazonaws.com");

    // And nothing was stored
    const stored = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertUndefined(stored.TopicConfigurations);
  });

  it("refuses a topic whose policy admits another Bucket", async () => {
    // Given a topic admitting S3 for a different Bucket
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: "arn:aws:s3:::reports",
    });

    // When this Bucket is configured to notify it
    const error = await notifyTopicRefusal(simAws, topicArn);

    // Then the source ARN condition keeps it out, so a grant written for one
    // Bucket does not open the topic to another
    assertStringIncludes(error.message, bucketArn);
  });

  it("refuses a topic in another Region", async () => {
    // Given a topic in another Region, admitting the Bucket
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      regionName: "eu-west-2",
      sourceArn: bucketArn,
    });

    // When the Bucket is configured to notify it
    const error = await notifyTopicRefusal(simAws, topicArn);

    // Then it is refused: real S3 requires the destination topic to be in the
    // Bucket's own Region, whatever either side's policies say
    assertStringIncludes(error.message, "must be in the Bucket's Region");
  });

  it("refuses a topic that is not there", async () => {
    // Given a Bucket and no topic
    const simAws = new SimAws();

    // When the Bucket is configured to notify one
    const error = await notifyTopicRefusal(
      simAws,
      `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`,
    );

    // Then the missing topic is named rather than the configuration being
    // stored and never delivered on
    assertStringIncludes(error.message, "is not a simulated SNS topic");
  });

  it("refuses a destination ARN that is not a topic", async () => {
    // Given a Bucket
    const simAws = new SimAws();

    // When the topic destination carries an SQS queue ARN
    const error = await notifyTopicRefusal(
      simAws,
      "arn:aws:sqs:us-east-1:888888888888:uploads",
    );

    // Then it is refused for what it is, since the destination group says what
    // kind of resource is wanted rather than the ARN doing so
    assertStringIncludes(error.message, "is not an SNS topic ARN");
  });

  it("refuses a subscription ARN as a topic destination", async () => {
    // Given a Bucket
    const simAws = new SimAws();

    // When the topic destination carries a subscription ARN, which is a topic
    // ARN with one more part on the end
    const error = await notifyTopicRefusal(
      simAws,
      "arn:aws:sns:us-east-1:888888888888:uploads:8b26d0f2",
    );

    // Then it is refused rather than read as the topic it is a subscription to
    assertStringIncludes(error.message, "is not an SNS topic ARN");
  });

  it("stops delivering when the topic policy stops admitting the Bucket", async () => {
    // Given a Bucket notifying a topic that admits it, with a subscribed queue
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
              Id: "uploads",
              Events: ["s3:ObjectCreated:*"],
              TopicArn: topicArn,
            },
          ],
        },
      }),
    );

    // When the topic policy is narrowed to another Bucket and an Object is put
    await simAws.sns().setTopicAttributes(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "Policy",
        AttributeValue: simS3TopicPolicy(topicArn, "arn:aws:s3:::reports"),
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );

    // Then nothing is delivered, and the refusal is recorded rather than the
    // earlier check being remembered
    assertUndefined(await simSnsDeliveredMessage(simAws, queueUrl));

    const failures = simAws.s3().getNotificationDeliveryFailures();
    assertArrayLength(failures, 1);
    assertTrue(failures[0].wasRefused);
    assertIdentical(failures[0].destinationArn, topicArn);
  });
});
