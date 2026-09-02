import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { SimS3NotImplemented } from "../error/sim-s3.error.js";

/**
 * The part of the S3 event document this test reads.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: { readonly object: { readonly key: string } };
    },
  ];
}

/**
 * Deleting an Object out of a Bucket serving a directory.
 *
 * A mounted Bucket is pointed at files the user wrote, so it refuses a delete
 * unless the mount asked for one. Code that deletes what it uploaded is then
 * testable against a mounted Bucket, and code that deletes by accident still
 * cannot take a build directory with it.
 */
describe("Deleting from a mounted simulated S3 Bucket [iso]", () => {
  /**
   * A Bucket serving a directory holding one file, and the function it tells
   * about Object removals.
   */
  async function mountedSite(
    simAws: SimAws,
    directoryPath: string,
    options: { readonly allowDelete?: boolean } = {},
  ): Promise<S3EventDocument[]> {
    const received: S3EventDocument[] = [];

    await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "auditor",
        Role: "arn:aws:iam::888888888888:role/AuditorRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: S3EventDocument) => {
            received.push(event);

            return "audited";
          }),
        },
      }),
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "auditor",
        StatementId: "AllowS3",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::site",
      }),
    );
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "site",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "removals",
              Events: ["s3:ObjectRemoved:*"],
              LambdaFunctionArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:auditor`,
            },
          ],
        },
      }),
    );

    simAws.s3().mountBucketFilesystem("site", directoryPath, options);

    return received;
  }

  it("removes the file and raises the removal event when the mount allows it", async () => {
    // Given a Bucket serving a build directory it may delete from, notifying a
    // function of removals
    const buildDirectory = new TemporaryDirectory();
    await buildDirectory.writeFile(["public", "stale.html"], "<h1>Stale</h1>");

    const simAws = new SimAws();
    const received = await mountedSite(simAws, buildDirectory.join("public"), {
      allowDelete: true,
    });

    // When the Object is deleted through S3
    await simAws
      .s3()
      .deleteObject(
        new DeleteObjectCommand({ Bucket: "site", Key: "stale.html" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the Bucket no longer holds it, and the function heard about it the
    // way it hears about an in-memory Bucket
    const bucket = simAws.s3().getSimBucketByName("site");

    assertNonNullable(bucket);
    assertUndefined(await bucket.getObject("stale.html"));

    assertArrayLength(received, 1);
    const records = received[0].Records;
    assertArrayLength(records, 1);
    assertIdentical(records[0].eventName, "ObjectRemoved:Delete");
    assertIdentical(records[0].s3.object.key, "stale.html");
  });

  it("refuses the delete and keeps the file when the mount does not allow it", async () => {
    // Given a Bucket serving a build directory, mounted as it is by default
    const buildDirectory = new TemporaryDirectory();
    await buildDirectory.writeFile(["public", "index.html"], "<h1>Hello</h1>");

    const simAws = new SimAws();
    const received = await mountedSite(simAws, buildDirectory.join("public"));

    // When the Object is deleted through S3
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .s3()
        .deleteObject(
          new DeleteObjectCommand({ Bucket: "site", Key: "index.html" }),
        );
    });
    await simAws.backgroundTasksComplete();

    // Then the refusal names the directory it would have unlinked a file from
    assertInstanceOf(error, SimS3NotImplemented);
    assertStringIncludes(error.message, "will not delete index.html");
    assertStringIncludes(error.message, buildDirectory.join("public"));

    // And the file is still served, with nothing raised about it
    const bucket = simAws.s3().getSimBucketByName("site");

    assertNonNullable(bucket);
    assertNonNullable(await bucket.getObject("index.html"));
    assertArrayEmpty(received);
  });
});
