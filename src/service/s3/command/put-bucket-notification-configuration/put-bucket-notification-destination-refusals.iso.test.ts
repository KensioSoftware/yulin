import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeObject,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("What a simulated S3 notification destination refuses", () => {
  it("refuses a FIFO queue destination by name", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration names a FIFO queue
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                QueueArn: "arn:aws:sqs:us-east-1:888888888888:uploads.fifo",
              },
            ],
          },
        }),
      ),
    );

    // Then the queue real S3 will not deliver to is named for what it is,
    // rather than being reported as a queue that is not there.
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "FIFO queue");
  });

  it("refuses an SNS topic destination by name", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration names a topic
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            TopicConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                TopicArn: "arn:aws:sns:us-east-1:888888888888:uploads",
              },
            ],
          },
        }),
      ),
    );

    // Then the destination it cannot deliver to is named
    assertStringIncludes(error.message, "SNS topic");
  });

  it("refuses an EventBridge destination by name", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration turns EventBridge on
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: { EventBridgeConfiguration: {} },
        }),
      ),
    );

    // Then the destination it cannot deliver to is named
    assertStringIncludes(error.message, "EventBridge");
  });

  it("accepts a configuration whose other destination groups are empty", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration carries empty queue and topic lists, which is what
    // an SDK caller restating a whole configuration sends
    const output = await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          QueueConfigurations: [],
          TopicConfigurations: [],
        },
      }),
    );

    // Then nothing is refused: there is no destination to refuse
    assertTypeObject(output.$metadata);
  });

  it("refuses an event type real S3 has that it cannot raise", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration asks for an event the simulator never produces
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:Copy"],
                LambdaFunctionArn: thumbnailerArn,
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused as unsimulated rather than accepted and never
    // delivered
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "s3:ObjectCreated:Copy");
  });

  it("refuses an event type S3 does not have", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration names something that is not an S3 event type.
    // The SDK's own types refuse this, so the request is built structurally,
    // the way one arriving over the REST endpoint would be.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration({
        input: {
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectUploaded:*"],
                LambdaFunctionArn: thumbnailerArn,
              },
            ],
          },
        },
      }),
    );

    // Then it is reported as a bad argument rather than as unsimulated
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "s3:ObjectUploaded:*");
  });
});
