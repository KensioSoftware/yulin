import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  DeleteObjectTaggingCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { SimS3NotImplemented } from "../error/sim-s3.error.js";

/**
 * The part of the S3 event document these tests read.
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

/**
 * A Bucket notifying a function of every change to an Object's tags, and the
 * events the function was given.
 */
async function taggingSimulation(bucketName: string): Promise<{
  readonly simAws: SimAws;
  readonly received: S3EventDocument[];
  readonly functionArn: string;
}> {
  const simAws = new SimAws();
  const received: S3EventDocument[] = [];
  const functionName = `tag-watcher-${faker.string.uuid()}`;
  const functionArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:${functionName}`;

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::888888888888:role/TagWatcherRole",
      Code: {
        ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
          received.push(event);

          return "noted";
        }),
      },
    }),
  );
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: "AllowS3",
      Action: "lambda:InvokeFunction",
      Principal: "s3.amazonaws.com",
      SourceArn: `arn:aws:s3:::${bucketName}`,
    }),
  );
  await simAws.s3().putBucketNotificationConfiguration(
    new PutBucketNotificationConfigurationCommand({
      Bucket: bucketName,
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          {
            Id: "tag-changes",
            Events: ["s3:ObjectTagging:*"],
            LambdaFunctionArn: functionArn,
          },
        ],
      },
    }),
  );

  return { simAws, received, functionArn };
}

/**
 * Notifying a destination of a change to an Object's tags.
 *
 * Real S3 raises `s3:ObjectTagging:Put` for a tag set that was written and
 * `s3:ObjectTagging:Delete` for one that was removed, and describes the Object
 * the tags sit on rather than the tags themselves.
 */
describe("Notifying a simulated destination of an Object tagging", () => {
  it("raises ObjectTagging:Put when an Object is tagged", async () => {
    // Given a Bucket notifying a function of tag changes, holding an Object.
    const bucketName = `uploads-${faker.string.uuid()}`;
    const { simAws, received } = await taggingSimulation(bucketName);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the Object is tagged.
    await simAws.s3().putObjectTagging(
      new PutObjectTaggingCommand({
        Bucket: bucketName,
        Key: "raw/cat.jpg",
        Tagging: { TagSet: [{ Key: "reviewed", Value: "yes" }] },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the function was given one record naming the tagged key.
    assertArrayLength(received, 1);
    const [record] = received[0].Records;
    assertIdentical(record.eventName, "ObjectTagging:Put");
    assertIdentical(record.s3.bucket.name, bucketName);
    const { key, size } = record.s3.object;
    assertIdentical(key, "raw/cat.jpg");
    assertIdentical(size, 11);
  });

  it("raises ObjectTagging:Delete when an Object's tags are removed", async () => {
    // Given a Bucket notifying a function of tag changes, holding a tagged
    // Object.
    const bucketName = `uploads-${faker.string.uuid()}`;
    const { simAws, received } = await taggingSimulation(bucketName);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "raw/cat.jpg",
        Body: "cat picture",
        Tagging: "reviewed=yes",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When its tags are removed.
    await simAws.s3().deleteObjectTagging(
      new DeleteObjectTaggingCommand({
        Bucket: bucketName,
        Key: "raw/cat.jpg",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the function was given one record for the removal.
    assertArrayLength(received, 1);
    const [record] = received[0].Records;
    assertIdentical(record.eventName, "ObjectTagging:Delete");
    assertIdentical(record.s3.object.key, "raw/cat.jpg");
  });

  it("leaves a Bucket configured for creations alone when tags change", async () => {
    // Given a Bucket notifying a function of creations only.
    const bucketName = `uploads-${faker.string.uuid()}`;
    const { simAws, received, functionArn } =
      await taggingSimulation(bucketName);
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucketName,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "creations",
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: functionArn,
            },
          ],
        },
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();
    received.length = 0;

    // When the Object is tagged.
    await simAws.s3().putObjectTagging(
      new PutObjectTaggingCommand({
        Bucket: bucketName,
        Key: "raw/cat.jpg",
        Tagging: { TagSet: [{ Key: "reviewed", Value: "yes" }] },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing was delivered, because the tagging events are not
    // configured.
    assertArrayEmpty(received);
  });

  it("still refuses an event type it cannot raise", async () => {
    // Given a Bucket.
    const simAws = new SimAws();
    const bucketName = `uploads-${faker.string.uuid()}`;
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    // When a configuration names an event simulated S3 does not raise.
    const configuring = await assertThrowsErrorAsync(async () => {
      await simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: bucketName,
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Id: "acl-changes",
                Events: ["s3:ObjectAcl:Put"],
                LambdaFunctionArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:watcher`,
              },
            ],
          },
        }),
      );
    });

    // Then it is refused by name, as it was before tagging was simulated.
    assertInstanceOf(configuring, SimS3NotImplemented);
  });
});
