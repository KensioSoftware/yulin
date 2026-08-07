import {
  DeleteObjectCommand,
  GetBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../../../test/sns/subscription-fixture.js";
import { simS3NotificationTopic } from "../../../../../../test/s3/notification-topic-fixture.js";
import { simCdkBucketNotificationsTemplateFactory } from "./sim-cdk-bucket-notifications-template.factory.js";

describe("CDK Bucket notifications to an SNS topic", () => {
  it("notifies a topic the way CDK's SnsDestination configures one", async () => {
    // Given a topic whose policy carries the ArnLike source ARN condition
    // CDK's SnsDestination writes, and a queue subscribed to it. CDK writes
    // that policy as an AWS::SNS::TopicPolicy, which simulated CloudFormation
    // does not deploy yet, so the topic is set up through the SDK here.
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: "arn:aws:s3:::uploads",
    });
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "uploads-queue",
      topicArn,
    );

    // When a template naming that topic alongside the function is deployed,
    // which is what a CDK app adding two destinations for two event types
    // synthesizes.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({
        notificationConfiguration: {
          TopicConfigurations: [
            {
              Id: "removals",
              Events: ["s3:ObjectRemoved:*"],
              TopicArn: topicArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] },
              },
            },
          ],
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then an Object removed from under the filtered prefix reaches the queue
    // two hops away.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws
      .s3()
      .deleteObject(
        new DeleteObjectCommand({ Bucket: "uploads", Key: "raw/cat.jpg" }),
      );

    assertNonNullable(await simSnsDeliveredMessage(simAws, queueUrl));

    // And the Bucket reports the configuration back under TopicConfigurations.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = output.TopicConfigurations;
    assertNonNullable(configurations);
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].Id, "removals");
    assertIdentical(configurations[0].TopicArn, topicArn);
    assertIdentical(
      configurations[0].Filter?.Key?.FilterRules?.[0]?.Value,
      "raw/",
    );
  });
});
