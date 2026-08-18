import type { Event } from "@aws-sdk/client-s3";
import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertStringEndsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

/**
 * The part of the S3 event document these tests read out of a message body.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: {
        readonly object: {
          readonly key: string;
          readonly size?: number;
          readonly eTag?: string;
        };
      };
    },
  ];
}

/**
 * What a Bucket says happened when an Object arrived in parts.
 *
 * Real S3 distinguishes how an Object came to be there, so an upload completed
 * from parts raises `s3:ObjectCreated:CompleteMultipartUpload` rather than the
 * Put a single-request upload raises. A consumer filtering on one of them is
 * relying on that difference.
 */
describe("Notifying a queue of an Object uploaded in parts", () => {
  const notifyingBucket = async (events: Event[]): Promise<SimAws> => {
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
            },
          }),
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
            { Id: "arrivals", Events: events, QueueArn: queueArn },
          ],
        },
      }),
    );

    return simAws;
  };

  const uploadInParts = async (simAws: SimAws): Promise<void> => {
    const simS3 = simAws.s3();
    const started = await simS3.createMultipartUpload(
      new CreateMultipartUploadCommand({
        Bucket: "uploads",
        Key: "raw/film.mov",
      }),
    );
    assertDefined(started.UploadId, "the issued upload id");

    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "uploads",
        Key: "raw/film.mov",
        UploadId: started.UploadId,
        PartNumber: 1,
        Body: "the first half",
      }),
    );
    await simS3.uploadPart(
      new UploadPartCommand({
        Bucket: "uploads",
        Key: "raw/film.mov",
        UploadId: started.UploadId,
        PartNumber: 2,
        Body: "the second half",
      }),
    );
    await simS3.completeMultipartUpload(
      new CompleteMultipartUploadCommand({
        Bucket: "uploads",
        Key: "raw/film.mov",
        UploadId: started.UploadId,
        MultipartUpload: { Parts: [{ PartNumber: 1 }, { PartNumber: 2 }] },
      }),
    );
    await simAws.backgroundTasksComplete();
  };

  const queuedEvents = async (simAws: SimAws): Promise<S3EventDocument[]> => {
    const queue = await simAws
      .sqs()
      .getQueueUrl(new GetQueueUrlCommand({ QueueName: "uploads" }));
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queue.QueueUrl,
        MaxNumberOfMessages: 10,
      }),
    );

    return (received.Messages ?? []).map(
      (message) => JSON.parse(message.Body) as S3EventDocument,
    );
  };

  it("says the Object was completed from parts, not put", async () => {
    // Given a Bucket notifying a queue of every kind of Object creation.
    const simAws = await notifyingBucket(["s3:ObjectCreated:*"]);

    // When an Object arrives in parts.
    await uploadInParts(simAws);

    // Then the event names the completion, and describes the Object it made:
    // the whole size, and the ETag that says it arrived in two parts.
    const events = await queuedEvents(simAws);
    assertArrayLength(events, 1);

    const [record] = events[0].Records;
    assertIdentical(record.eventName, "ObjectCreated:CompleteMultipartUpload");

    const { key, size, eTag } = record.s3.object;
    assertIdentical(key, "raw/film.mov");
    assertIdentical(size, 29);
    assertDefined(eTag, "the created Object's ETag");
    assertStringEndsWith(eTag, "-2");
  });

  it("leaves a consumer wanting only puts alone", async () => {
    // Given a Bucket notifying a queue of single-request uploads only.
    const simAws = await notifyingBucket(["s3:ObjectCreated:Put"]);

    // When an Object arrives in parts, and another arrives in one request.
    await uploadInParts(simAws);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/note.txt",
        Body: "a note",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the put was notified, as real S3 distinguishes the two.
    const events = await queuedEvents(simAws);
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0].s3.object.key, "raw/note.txt");
  });

  it("refuses a configuration that would overlap the wildcard", async () => {
    // Given a Bucket already notifying on every kind of Object creation.
    const simAws = await notifyingBucket(["s3:ObjectCreated:*"]);
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;

    // When a second configuration names one of the members the wildcard covers.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.s3().putBucketNotificationConfiguration(
          new PutBucketNotificationConfigurationCommand({
            Bucket: "uploads",
            NotificationConfiguration: {
              QueueConfigurations: [
                {
                  Id: "arrivals",
                  Events: ["s3:ObjectCreated:*"],
                  QueueArn: queueArn,
                },
                {
                  Id: "completions",
                  Events: ["s3:ObjectCreated:CompleteMultipartUpload"],
                  QueueArn: queueArn,
                },
              ],
            },
          }),
        ),
    );

    // Then it is refused, because the wildcard now expands to include it and
    // real S3 has no rule for which of the two would win.
    assertIdentical(error.name, "InvalidArgument");
  });
});
