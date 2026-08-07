/**
 * The overlap rule, worked through the examples in the AWS documentation.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-filtering.html
 *
 * AWS states the rule with SNS topic and SQS queue destinations. The prefixes,
 * suffixes and event types are ported as they are written there; the
 * destination is a Lambda function, since the rule is the same whatever the
 * destination is, and the last case here proves that by mixing two groups.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("Overlapping S3 notification configurations", () => {
  it("refuses a filtered configuration alongside an unfiltered one", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When one configuration filters nothing and another filters on a prefix,
    // both for the same event
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Id: "everything",
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
              },
              {
                Id: "images",
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: { FilterRules: [{ Name: "prefix", Value: "images" }] },
                },
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused: the root prefix overlaps every other prefix
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "overlap");
  });

  it("refuses suffixes where one ends the other", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When one configuration takes "jpg" and another takes "pg", and the
    // wildcard event covers the concrete one
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Id: "jpg",
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: { FilterRules: [{ Name: "suffix", Value: "jpg" }] },
                },
              },
              {
                Id: "pg",
                Events: ["s3:ObjectCreated:Put"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: { FilterRules: [{ Name: "suffix", Value: "pg" }] },
                },
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused: a key can end with both
    assertStringIncludes(error.message, "overlap");
  });

  it("refuses overlapping prefixes and suffixes together", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When one configuration takes "images" with "jpg" and another takes "jpg"
    // under any prefix
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Id: "images-jpg",
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: {
                    FilterRules: [
                      { Name: "prefix", Value: "images" },
                      { Name: "suffix", Value: "jpg" },
                    ],
                  },
                },
              },
              {
                Id: "any-jpg",
                Events: ["s3:ObjectCreated:Put"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: { FilterRules: [{ Name: "suffix", Value: "jpg" }] },
                },
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused: both ends overlap
    assertStringIncludes(error.message, "overlap");
  });

  it("accepts a shared prefix with suffixes that cannot both match", async () => {
    // Given a Bucket whose function allows S3 to invoke it
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "thumbnailed") },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "thumbnailer",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::uploads",
      }),
    );

    // When two configurations share the "images" prefix but take ".jpg" and
    // ".png"
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "images-jpg",
              Events: ["s3:ObjectCreated:Put"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: {
                  FilterRules: [
                    { Name: "prefix", Value: "images" },
                    { Name: "suffix", Value: ".jpg" },
                  ],
                },
              },
            },
            {
              Id: "images-png",
              Events: ["s3:ObjectCreated:Put"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: {
                  FilterRules: [
                    { Name: "prefix", Value: "images" },
                    { Name: "suffix", Value: ".png" },
                  ],
                },
              },
            },
          ],
        },
      }),
    );

    // Then both are stored: no key ends with both suffixes
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertArrayLength(read.LambdaFunctionConfigurations ?? [], 2);
  });

  it("accepts the same filter for different event types", async () => {
    // Given a Bucket whose function allows S3 to invoke it
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "thumbnailed") },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "thumbnailer",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::uploads",
      }),
    );

    // When one configuration takes creations under "image/" and another takes
    // removals under the same prefix
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "created",
              Events: ["s3:ObjectCreated:Put"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "image/" }] },
              },
            },
            {
              Id: "removed",
              Events: ["s3:ObjectRemoved:*"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "image/" }] },
              },
            },
          ],
        },
      }),
    );

    // Then both are stored: the rule is about filters sharing an event type
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertArrayLength(read.LambdaFunctionConfigurations ?? [], 2);
  });

  it("accepts prefixes neither of which starts the other", async () => {
    // Given a Bucket whose function allows S3 to invoke it
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "thumbnailed") },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "thumbnailer",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::uploads",
      }),
    );

    // When one takes "images/" and the other takes "logs/"
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "images",
              Events: ["s3:ObjectCreated:Put"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "images/" }] },
              },
            },
            {
              Id: "logs",
              Events: ["s3:ObjectCreated:Put"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "logs/" }] },
              },
            },
          ],
        },
      }),
    );

    // Then both are stored
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertArrayLength(read.LambdaFunctionConfigurations ?? [], 2);
  });

  it("refuses a topic and a queue that want the same event", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a topic destination and a queue destination take the same event
    // with filters that could both match a key
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            TopicConfigurations: [
              {
                Id: "topic",
                Events: ["s3:ObjectCreated:*"],
                TopicArn: "arn:aws:sns:us-east-1:888888888888:uploads",
              },
            ],
            QueueConfigurations: [
              {
                Id: "queue",
                Events: ["s3:ObjectCreated:Put"],
                QueueArn: "arn:aws:sqs:us-east-1:888888888888:uploads",
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused, as it would be for two of the same kind: the rule is
    // about event sets and filters rather than about destination groups
    assertStringIncludes(error.message, "overlap");
  });
});
