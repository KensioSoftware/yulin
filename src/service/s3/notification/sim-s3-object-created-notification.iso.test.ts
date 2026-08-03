import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertStringStartsWith,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

/**
 * The shape of the event document a handler receives, as far as these tests
 * read it.
 */
interface S3EventRecord {
  readonly eventVersion: string;
  readonly eventSource: string;
  readonly awsRegion: string;
  readonly eventTime: string;
  readonly eventName: string;
  readonly userIdentity: { readonly principalId: string };
  readonly s3: {
    readonly configurationId: string;
    readonly bucket: { readonly name: string; readonly arn: string };
    readonly object: {
      readonly key: string;
      readonly size?: number;
      readonly eTag?: string;
      readonly sequencer: string;
    };
  };
}

interface S3EventDocument {
  readonly Records: readonly [S3EventRecord];
}

describe("Notifying a simulated Lambda function of a created Object", () => {
  it("invokes the function with the S3 event document", async () => {
    // Given a Bucket that notifies a function when an Object is created
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

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
        SourceAccount: simAws.defaultAccountId,
      }),
    );
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "thumbnails",
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: thumbnailerArn,
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

    // Then the function was invoked once with the event S3 sends
    assertArrayLength(received, 1);
    const records = received[0].Records;
    assertArrayLength(records, 1);
    assertStringStartsWith(records[0].eventVersion, "2.");
    assertIdentical(records[0].eventSource, "aws:s3");
    assertIdentical(records[0].awsRegion, "us-east-1");
    assertIdentical(records[0].eventName, "ObjectCreated:Put");
    assertIdentical(records[0].s3.configurationId, "thumbnails");
    assertIdentical(records[0].s3.bucket.name, "uploads");
    assertIdentical(records[0].s3.bucket.arn, "arn:aws:s3:::uploads");
    const { key, size, eTag } = records[0].s3.object;
    assertIdentical(key, "raw/cat.jpg");
    assertIdentical(size, 11);
    // The ETag of an Object real S3 stored in one part is the MD5 of its bytes.
    assertIdentical(eTag, "189f2c9e9bf1c7804c76384671f113ed");
  });

  it("takes its event time from the simulation's clock", async () => {
    // Given a frozen simulated clock, and a Bucket notifying a function
    const simAws = new SimAws();
    simAws.clock().freeze();
    await simAws.clock().setTo(new Date("2027-03-04T05:06:07.000Z"));
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

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
              Id: "thumbnails",
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: thumbnailerArn,
            },
          ],
        },
      }),
    );

    // When an Object is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the event carries the simulated instant rather than the host's
    assertArrayLength(received, 1);
    assertIdentical(
      received[0].Records[0].eventTime,
      "2027-03-04T05:06:07.000Z",
    );
  });

  it("form-URL-encodes the object key, as real S3 does", async () => {
    // Given a Bucket notifying a function
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

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
            },
          ],
        },
      }),
    );

    // When an Object whose key contains a space is put into it
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "images/red flower.jpg",
        Body: "flower",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the key arrives encoded, with the prefix separator left alone
    assertArrayLength(received, 1);
    assertIdentical(
      received[0].Records[0].s3.object.key,
      "images/red+flower.jpg",
    );
  });

  it("names the caller that wrote the Object", async () => {
    // Given a Bucket notifying a function
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

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
            },
          ],
        },
      }),
    );

    // When a named principal writes an Object
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "UploaderRole",
        actions: ["s3:PutObject"],
        resource: "arn:aws:s3:::uploads/*",
      },
      simAws,
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );
    await simAws.backgroundTasksComplete();

    // Then the event names it. Real S3 puts the principal's unique id here;
    // simulated IAM carries ARNs, so the ARN is what a test can assert on.
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].userIdentity.principalId, role.Arn);
  });

  it("orders the events for one key with the sequencer", async () => {
    // Given a Bucket notifying a function
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

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
            },
          ],
        },
      }),
    );

    // When the same key is written twice
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "one",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "two",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the later event carries the greater sequencer
    assertArrayLength(received, 2);
    const first = received[0].Records[0].s3.object.sequencer;
    const second = received[1].Records[0].s3.object.sequencer;
    assertTrue(first < second);
  });
});
