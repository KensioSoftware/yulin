import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

const cleanerArn = "arn:aws:lambda:us-east-1:888888888888:function:cleaner";

/**
 * The part of the event document these tests read.
 */
interface S3EventRecord {
  readonly eventName: string;
  readonly s3: {
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

describe("Notifying a simulated Lambda function of a removed Object", () => {
  it("raises ObjectRemoved:Delete without a size or an ETag", async () => {
    // Given a Bucket holding an Object, notifying a function when one is
    // removed
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "cleaner",
        Role: "arn:aws:iam::888888888888:role/CleanerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

            return "cleaned";
          }),
        },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "cleaner",
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
              Id: "cleanup",
              Events: ["s3:ObjectRemoved:*"],
              LambdaFunctionArn: cleanerArn,
            },
          ],
        },
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
    );

    // When the Object is deleted
    await simAws
      .s3()
      .deleteObject(
        new DeleteObjectCommand({ Bucket: "uploads", Key: "cat.jpg" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the removal is notified, describing an Object that is no longer
    // there
    assertArrayLength(received, 1);
    const record = received[0].Records[0];
    assertIdentical(record.eventName, "ObjectRemoved:Delete");
    assertIdentical(record.s3.object.key, "cat.jpg");
    assertUndefined(record.s3.object.size);
    assertUndefined(record.s3.object.eTag);
  });

  it("raises nothing for a key that was not there", async () => {
    // Given a Bucket with nothing in it, notifying a function on removal
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "cleaner",
        Role: "arn:aws:iam::888888888888:role/CleanerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

            return "cleaned";
          }),
        },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "cleaner",
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
              LambdaFunctionArn: cleanerArn,
            },
          ],
        },
      }),
    );

    // When a key that was never stored is deleted
    await simAws
      .s3()
      .deleteObject(
        new DeleteObjectCommand({ Bucket: "uploads", Key: "never-here.jpg" }),
      );
    await simAws.backgroundTasksComplete();

    // Then nothing is notified: no deletion happened
    assertArrayEmpty(received);
  });

  it("raises one event per Object a batch deletion removed", async () => {
    // Given a Bucket holding two Objects, notifying a function on removal
    const simAws = new SimAws();
    const notifiedKeys: string[] = [];
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "cleaner",
        Role: "arn:aws:iam::888888888888:role/CleanerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            notifiedKeys.push(event.Records[0].s3.object.key);

            return "cleaned";
          }),
        },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "cleaner",
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
              LambdaFunctionArn: cleanerArn,
            },
          ],
        },
      }),
    );
    await simAws
      .s3()
      .putObject(
        new PutObjectCommand({ Bucket: "uploads", Key: "a.jpg", Body: "a" }),
      );
    await simAws
      .s3()
      .putObject(
        new PutObjectCommand({ Bucket: "uploads", Key: "b.jpg", Body: "b" }),
      );

    // When both are deleted in one request, alongside a key that is not there
    await simAws.s3().deleteObjects(
      new DeleteObjectsCommand({
        Bucket: "uploads",
        Delete: {
          Objects: [{ Key: "a.jpg" }, { Key: "b.jpg" }, { Key: "c.jpg" }],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then one event is raised per Object actually removed
    assertArrayEquals(
      notifiedKeys.toSorted((one, other) => one.localeCompare(other)),
      ["a.jpg", "b.jpg"],
    );
  });
});
