import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  type Event as S3NotificationEvent,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

const archiverArn = "arn:aws:lambda:us-east-1:888888888888:function:archiver";

/**
 * As much of the event document as these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: {
        readonly bucket: { readonly name: string };
        readonly object: { readonly key: string; readonly size?: number };
      };
    },
  ];
}

describe("Notifying a simulated Lambda function of a copied Object", () => {
  /**
   * A Bucket that invokes a recording function for the events it is given.
   *
   * Both tests need the same wiring and differ only in the events they
   * configure, so this stays here rather than becoming a shared factory.
   */
  const bucketNotifying = async (
    simAws: SimAws,
    bucketName: string,
    events: S3NotificationEvent[],
  ): Promise<S3EventDocument[]> => {
    const received: S3EventDocument[] = [];

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "archiver",
        Role: "arn:aws:iam::888888888888:role/ArchiverRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

            return "archived";
          }),
        },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "archiver",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: `arn:aws:s3:::${bucketName}`,
        SourceAccount: simAws.defaultAccountId,
      }),
    );
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucketName,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            { Events: events, LambdaFunctionArn: archiverArn },
          ],
        },
      }),
    );

    return received;
  };

  it("raises ObjectCreated:Copy on the destination Bucket", async () => {
    // Given an archive Bucket that notifies a function when an Object is
    // copied into it, and an Object waiting to be copied.
    const simAws = new SimAws();
    const received = await bucketNotifying(simAws, "archive", [
      "s3:ObjectCreated:Copy",
    ]);

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "inbox" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "inbox",
        Key: "report.pdf",
        Body: "quarterly figures",
      }),
    );

    // When the Object is copied into the archive.
    await simAws.s3().copyObject(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "2026/report.pdf",
        CopySource: "inbox/report.pdf",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the function was told about the copy, and told it was a copy rather
    // than a put.
    assertArrayLength(received, 1);
    const record = received[0].Records[0];
    const copiedBytes = record.s3.object.size;

    assertIdentical(record.eventName, "ObjectCreated:Copy");
    assertIdentical(record.s3.bucket.name, "archive");
    assertIdentical(record.s3.object.key, "2026/report.pdf");
    assertIdentical(copiedBytes, "quarterly figures".length);
  });

  it("covers a copy with the ObjectCreated wildcard", async () => {
    // Given a Bucket configured for every kind of Object creation.
    const simAws = new SimAws();
    const received = await bucketNotifying(simAws, "archive", [
      "s3:ObjectCreated:*",
    ]);

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "inbox" }));
    await simAws
      .s3()
      .putObject(
        new PutObjectCommand({ Bucket: "inbox", Key: "one.txt", Body: "one" }),
      );

    // When an Object is copied into it.
    await simAws.s3().copyObject(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "one.txt",
        CopySource: "inbox/one.txt",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the wildcard covered the copy, as it covers a put.
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].eventName, "ObjectCreated:Copy");
  });

  it("leaves a Bucket configured only for Put alone", async () => {
    // Given a Bucket that asked for puts and nothing else.
    const simAws = new SimAws();
    const received = await bucketNotifying(simAws, "archive", [
      "s3:ObjectCreated:Put",
    ]);

    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "inbox" }));
    await simAws
      .s3()
      .putObject(
        new PutObjectCommand({ Bucket: "inbox", Key: "one.txt", Body: "one" }),
      );

    // When an Object is copied into it.
    await simAws.s3().copyObject(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "one.txt",
        CopySource: "inbox/one.txt",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing was delivered, because real S3 keeps a copy and a put
    // apart.
    assertArrayLength(received, 0);
  });
});
