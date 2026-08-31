import {
  CreateBucketCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../../iam/policy/sim-iam-policy-document.factory.js";

/**
 * The policy statement AWS documents for an S3 event notification destination
 * queue, which is what a Bucket has to be admitted by.
 */
function sendPolicyFor(queueArn: string, sourceArn: string): string {
  return simIamPolicyDocumentFactory.make({
    Statement: {
      Principal: { Service: "s3.amazonaws.com" },
      Action: "sqs:SendMessage",
      Resource: queueArn,
      Condition: { ArnLike: { "aws:SourceArn": sourceArn } },
    },
  });
}

describe("What a simulated SQS notification destination refuses", () => {
  it("refuses a queue whose policy admits nothing", async () => {
    // Given a queue with no policy at all, and a Bucket
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When the Bucket is configured to notify it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              { Events: ["s3:ObjectCreated:*"], QueueArn: queueArn },
            ],
          },
        }),
      ),
    );

    // Then it is refused, since a service principal owns no identity policies
    // and the queue policy is the whole decision
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "does not allow s3.amazonaws.com");

    // And nothing was stored
    const stored = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertArrayEmpty(stored.QueueConfigurations ?? []);
  });

  it("refuses a queue whose policy admits another Bucket", async () => {
    // Given a queue admitting S3 for a different Bucket
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: sendPolicyFor(queueArn, "arn:aws:s3:::reports"),
        },
      }),
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When this Bucket is configured to notify it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              { Events: ["s3:ObjectCreated:*"], QueueArn: queueArn },
            ],
          },
        }),
      ),
    );

    // Then the source ARN condition keeps it out, so a grant written for one
    // Bucket does not open the queue to another
    assertStringIncludes(error.message, "arn:aws:s3:::uploads");
  });

  it("refuses a queue in another Region", async () => {
    // Given a queue in another Region, admitting the Bucket
    const simAws = new SimAws();
    const otherSqs = simAws
      .account(simAws.defaultAccountId)
      .region("eu-west-2")
      .sqs();
    const queueArn = `arn:aws:sqs:eu-west-2:${simAws.defaultAccountId}:uploads`;
    const created = await otherSqs.createQueue(
      new CreateQueueCommand({ QueueName: "uploads" }),
    );
    await otherSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: sendPolicyFor(queueArn, "arn:aws:s3:::uploads"),
        },
      }),
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When the Bucket is configured to notify it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              { Events: ["s3:ObjectCreated:*"], QueueArn: queueArn },
            ],
          },
        }),
      ),
    );

    // Then it is refused: real S3 requires the destination queue to be in the
    // Bucket's own Region, whatever either side's policies say
    assertStringIncludes(error.message, "must be in the Bucket's Region");
  });

  it("refuses a queue that is not there", async () => {
    // Given a Bucket and no queue
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When the Bucket is configured to notify one
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                QueueArn: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`,
              },
            ],
          },
        }),
      ),
    );

    // Then the missing queue is named rather than the configuration being
    // stored and never delivered on
    assertStringIncludes(error.message, "is not a simulated SQS queue");
  });

  it("refuses a destination ARN that is not a queue", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When the queue destination carries an SNS topic ARN
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                QueueArn: "arn:aws:sns:us-east-1:888888888888:uploads",
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused for what it is
    assertStringIncludes(error.message, "is not an SQS queue ARN");
  });

  it("stops delivering when the queue policy stops admitting the Bucket", async () => {
    // Given a Bucket notifying a queue that admits it
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: sendPolicyFor(queueArn, "arn:aws:s3:::uploads"),
        },
      }),
    );
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          QueueConfigurations: [
            {
              Id: "uploads",
              Events: ["s3:ObjectCreated:*"],
              QueueArn: queueArn,
            },
          ],
        },
      }),
    );

    // When the queue policy is narrowed to another Bucket and an Object is put
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: sendPolicyFor(queueArn, "arn:aws:s3:::reports"),
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

    // Then nothing is delivered, and the refusal is recorded rather than the
    // event simply disappearing
    const received = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
      );
    assertArrayEmpty(received.Messages ?? []);

    const failures = simAws.s3().getNotificationDeliveryFailures();
    assertArrayLength(failures, 1);
    assertTrue(failures[0].wasRefused);
    assertIdentical(failures[0].destinationArn, queueArn);
  });
});
