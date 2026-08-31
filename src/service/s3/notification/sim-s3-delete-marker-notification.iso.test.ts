import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  type Event as S3NotificationEvent,
  PutBucketNotificationConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
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
      readonly versionId?: string;
      readonly size?: number;
    };
  };
}

interface S3EventDocument {
  readonly Records: readonly [S3EventRecord];
}

/**
 * A versioned Bucket notifying a function of every removal, and the events
 * that function receives.
 */
async function versionedBucketNotifying(
  events: S3NotificationEvent[],
): Promise<{ simAws: SimAws; received: S3EventDocument[] }> {
  const simAws = new SimAws();
  const received: S3EventDocument[] = [];

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "history" }));
  await simAws.s3().putBucketVersioning(
    new PutBucketVersioningCommand({
      Bucket: "history",
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
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
      SourceArn: "arn:aws:s3:::history",
    }),
  );
  await simAws.s3().putBucketNotificationConfiguration(
    new PutBucketNotificationConfigurationCommand({
      Bucket: "history",
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          { Id: "cleanup", Events: events, LambdaFunctionArn: cleanerArn },
        ],
      },
    }),
  );

  return { simAws, received };
}

describe("Notifying a simulated Lambda function of a delete marker", () => {
  it("raises DeleteMarkerCreated rather than Delete on a versioned Bucket", async () => {
    // Given a versioned Bucket holding an Object, notifying on any removal
    const { simAws, received } = await versionedBucketNotifying([
      "s3:ObjectRemoved:*",
    ]);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
        Body: "saved",
      }),
    );

    // When the key is deleted
    const deleted = await simAws.s3().deleteObject(
      new DeleteObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the marker the delete wrote is what is notified, under the id it
    // was written with, because nothing was actually removed.
    assertNonNullable(deleted.VersionId);
    assertArrayLength(received, 1);
    const record = received[0].Records[0];
    assertIdentical(record.eventName, "ObjectRemoved:DeleteMarkerCreated");
    assertIdentical(record.s3.object.versionId, deleted.VersionId);
    assertUndefined(record.s3.object.size);
  });

  it("leaves a Delete-only configuration unnotified by a delete marker", async () => {
    // Given a versioned Bucket notifying only on an Object being removed
    const { simAws, received } = await versionedBucketNotifying([
      "s3:ObjectRemoved:Delete",
    ]);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
        Body: "saved",
      }),
    );

    // When the key is deleted, which writes a marker rather than removing it
    await simAws.s3().deleteObject(
      new DeleteObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing is notified, because the two removals are separate events
    // and only one of them happened.
    assertArrayEmpty(received);
  });

  it("raises Delete when a version is removed for good", async () => {
    // Given a versioned Bucket holding an Object, notifying on any removal
    const { simAws, received } = await versionedBucketNotifying([
      "s3:ObjectRemoved:*",
    ]);
    const put = await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
        Body: "saved",
      }),
    );
    assertNonNullable(put.VersionId);

    // When that version is deleted by its own id
    await simAws.s3().deleteObject(
      new DeleteObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
        VersionId: put.VersionId,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then it is the removal event, since the bytes really are gone.
    assertArrayLength(received, 1);
    const record = received[0].Records[0];
    assertIdentical(record.eventName, "ObjectRemoved:Delete");
    assertIdentical(record.s3.object.versionId, put.VersionId);
  });

  it("still refuses an event type it cannot raise", async () => {
    // Given a versioned Bucket
    const { simAws } = await versionedBucketNotifying(["s3:ObjectRemoved:*"]);

    // When it is configured for a lifecycle event the simulator never raises
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "history",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:LifecycleExpiration:DeleteMarkerCreated"],
                LambdaFunctionArn: cleanerArn,
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused by name, which the delete marker event no longer is.
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "s3:ObjectRemoved:DeleteMarkerCreated");
  });
});
