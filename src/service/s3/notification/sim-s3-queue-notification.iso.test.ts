import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";

/**
 * The part of the S3 event document these tests read out of a message body.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventVersion: string;
      readonly eventName: string;
      readonly s3: {
        readonly configurationId: string;
        readonly bucket: { readonly name: string };
        readonly object: { readonly key: string; readonly size?: number };
      };
    },
  ];
}

describe("Notifying a simulated SQS queue of an Object event", () => {
  it("puts the event document on the queue as a message body", async () => {
    // Given a queue whose policy lets one Bucket's events onto it
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: { Service: "s3.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" },
              },
            },
          }),
        },
      }),
    );

    // And a Bucket configured to notify it
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          QueueConfigurations: [
            {
              Id: "raw-uploads",
              Events: ["s3:ObjectCreated:*"],
              QueueArn: queueArn,
            },
          ],
        },
      }),
    );

    // When an Object is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the whole Records document is on the queue as one message body
    const received = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
      );
    assertArrayLength(received.Messages ?? [], 1);
    const body = received.Messages?.[0]?.Body;
    assertNonNullable(body);
    const document = JSON.parse(body) as S3EventDocument;
    assertArrayLength(document.Records, 1);
    assertStringStartsWith(document.Records[0].eventVersion, "2.");
    assertIdentical(document.Records[0].eventName, "ObjectCreated:Put");
    assertIdentical(document.Records[0].s3.configurationId, "raw-uploads");
    assertIdentical(document.Records[0].s3.bucket.name, "uploads");
    const { key, size } = document.Records[0].s3.object;
    assertIdentical(key, "raw/cat.jpg");
    assertIdentical(size, 11);
  });

  it("notifies the queue of a removed Object", async () => {
    // Given a queue admitting S3, and a Bucket notifying it of removals
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:removals`;
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "removals" }));
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: { Service: "s3.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
            },
          }),
        },
      }),
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
          QueueConfigurations: [
            {
              Id: "removals",
              Events: ["s3:ObjectRemoved:*"],
              QueueArn: queueArn,
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
    await simAws.backgroundTasksComplete();

    // Then the removal record is on the queue, carrying no size, as a real
    // removal record carries none
    const received = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
      );
    const body = received.Messages?.[0]?.Body;
    assertNonNullable(body);
    const document = JSON.parse(body) as S3EventDocument;
    assertIdentical(document.Records[0].eventName, "ObjectRemoved:Delete");
    const { size } = document.Records[0].s3.object;
    assertUndefined(size);
  });

  it("reaches a function through an event source mapping on the queue", async () => {
    // Given a queue delivering to a function through an event source mapping
    const source = await simAwsWithSqsEventSource();
    const { simAws, queueArn, queueUrl, events } = source;

    // And a queue policy letting a Bucket's events onto it
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: {
          Policy: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: { Service: "s3.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" },
              },
            },
          }),
        },
      }),
    );

    // And a Bucket configured to notify the queue
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

    // When an Object is put into the Bucket
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler was given the S3 event document inside an SQS record,
    // which is the double envelope a consumer of this chain has to reach
    // through
    assertArrayLength(events, 1);
    const records = events[0].Records;
    assertArrayLength(records, 1);
    const { body } = records[0];
    assertNonNullable(body);
    const document = JSON.parse(body) as S3EventDocument;
    assertIdentical(document.Records[0].s3.object.key, "raw/cat.jpg");
  });

  it("notifies a queue in another Account that admits the Bucket", async () => {
    // Given a queue in another Account, admitting this Bucket's Account
    const simAws = new SimAws();
    const otherAccountId = "222222222222";
    const otherSqs = simAws
      .account(otherAccountId)
      .region(simAws.defaultRegionName)
      .sqs();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${otherAccountId}:uploads`;
    const created = await otherSqs.createQueue(
      new CreateQueueCommand({ QueueName: "uploads" }),
    );
    await otherSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: { Service: "s3.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                StringEquals: { "aws:SourceAccount": simAws.defaultAccountId },
              },
            },
          }),
        },
      }),
    );

    // And a Bucket in this Account configured to notify it
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

    // When an Object is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the event reached the other Account's queue, since the source
    // Account is what its policy asked about
    const received = await otherSqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
    );
    assertArrayLength(received.Messages ?? [], 1);
  });
});
