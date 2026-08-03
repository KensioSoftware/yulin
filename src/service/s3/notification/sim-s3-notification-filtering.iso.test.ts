import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertArrayEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

/**
 * The part of the event document these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    { readonly s3: { readonly object: { readonly key: string } } },
  ];
}

describe("Filtering simulated S3 event notifications by object key", () => {
  it("notifies for a key under the configured prefix and no other", async () => {
    // Given a Bucket that notifies a function only for the "raw/" prefix
    const simAws = new SimAws();
    const notifiedKeys: string[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            notifiedKeys.push(event.Records[0].s3.object.key);

            return "thumbnailed";
          }),
        },
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
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] },
              },
            },
          ],
        },
      }),
    );

    // When one Object is written under the prefix and one outside it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cooked/cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the matching one is notified
    assertArrayEquals(notifiedKeys, ["raw/cat.jpg"]);
  });

  it("notifies for a key with the configured suffix and no other", async () => {
    // Given a Bucket that notifies a function only for ".jpg" keys
    const simAws = new SimAws();
    const notifiedKeys: string[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            notifiedKeys.push(event.Records[0].s3.object.key);

            return "thumbnailed";
          }),
        },
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
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: {
                Key: { FilterRules: [{ Name: "suffix", Value: ".jpg" }] },
              },
            },
          ],
        },
      }),
    );

    // When an image and a document are written
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "notes.txt",
        Body: "notes",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the image is notified
    assertArrayEquals(notifiedKeys, ["cat.jpg"]);
  });

  it("filters nothing when a rule states a name and no value", async () => {
    // Given a Bucket whose prefix rule carries no value
    const simAws = new SimAws();
    const notifiedKeys: string[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            notifiedKeys.push(event.Records[0].s3.object.key);

            return "thumbnailed";
          }),
        },
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
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: thumbnailerArn,
              Filter: { Key: { FilterRules: [{ Name: "prefix" }] } },
            },
          ],
        },
      }),
    );

    // When an Object is written under any prefix
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "anywhere/cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then it is notified: the root prefix matches every key
    assertArrayEquals(notifiedKeys, ["anywhere/cat.jpg"]);
  });

  it("notifies nothing for an event type nobody configured", async () => {
    // Given a Bucket that notifies a function only when an Object is removed
    const simAws = new SimAws();
    const notifiedKeys: string[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            notifiedKeys.push(event.Records[0].s3.object.key);

            return "thumbnailed";
          }),
        },
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
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: ["s3:ObjectRemoved:*"],
              LambdaFunctionArn: thumbnailerArn,
            },
          ],
        },
      }),
    );

    // When an Object is created
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing is notified
    assertArrayEquals(notifiedKeys, []);
  });
});
