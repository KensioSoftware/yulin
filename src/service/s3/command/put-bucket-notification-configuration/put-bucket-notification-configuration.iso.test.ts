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
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("S3 PutBucketNotificationConfigurationCommand", () => {
  it("stores a configuration that GetBucketNotificationConfiguration reports", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // And a function that allows S3 to invoke it for that Bucket
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
        SourceAccount: simAws.defaultAccountId,
      }),
    );

    // When a notification configuration is applied
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "thumbnail-raw-uploads",
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

    // Then it is reported back as it was applied
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = read.LambdaFunctionConfigurations ?? [];
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].Id, "thumbnail-raw-uploads");
    assertIdentical(configurations[0].LambdaFunctionArn, thumbnailerArn);
    assertIdentical(configurations[0].Events?.[0], "s3:ObjectCreated:*");
    assertIdentical(
      configurations[0].Filter?.Key?.FilterRules?.[0]?.Value,
      "raw/",
    );
  });

  it("replaces the whole configuration rather than adding to it", async () => {
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

    // And a configuration that notifies on creation
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "on-create",
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: thumbnailerArn,
            },
          ],
        },
      }),
    );

    // When another configuration is applied
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "on-remove",
              Events: ["s3:ObjectRemoved:*"],
              LambdaFunctionArn: thumbnailerArn,
            },
          ],
        },
      }),
    );

    // Then only the second one is there, as real S3 replaces rather than merges
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = read.LambdaFunctionConfigurations ?? [];
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].Id, "on-remove");
  });

  it("generates a configuration id for a configuration without one", async () => {
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

    // When a configuration is applied without an Id
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

    // Then S3 gives it one and reports it back, as real S3 does
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertNonNullable(
      read.LambdaFunctionConfigurations?.[0]?.Id,
      "the configuration was given an id",
    );
  });

  it("reports an empty configuration for a Bucket with none", async () => {
    // Given a Bucket nobody has configured
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When its notification configuration is read
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );

    // Then it answers nothing configured rather than an error
    assertUndefined(read.LambdaFunctionConfigurations);
  });

  it("reports a Bucket that does not exist", async () => {
    // Given no Bucket of that name
    const simAws = new SimAws();

    // When a configuration is applied to it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "absent",
          NotificationConfiguration: {},
        }),
      ),
    );

    // Then the missing Bucket is reported before anything else
    assertStringIncludes(error.message, "No S3 Bucket named absent");
  });

  it("reports a Bucket that does not exist when reading", async () => {
    // Given no Bucket of that name
    const simAws = new SimAws();

    // When its notification configuration is read
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .s3()
        .getBucketNotificationConfiguration(
          new GetBucketNotificationConfigurationCommand({ Bucket: "absent" }),
        ),
    );

    // Then the missing Bucket is reported
    assertStringIncludes(error.message, "No S3 Bucket named absent");
  });

  it("rejects a request naming no Bucket", async () => {
    // Given a command with no Bucket
    const simAws = new SimAws();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: undefined,
          NotificationConfiguration: {},
        }),
      ),
    );

    // Then the malformed request is reported
    assertStringIncludes(
      error.message,
      "PutBucketNotificationConfigurationCommand.input.Bucket",
    );
  });

  it("rejects a request carrying no configuration", async () => {
    // Given a Bucket and a command with no NotificationConfiguration
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: undefined,
        }),
      ),
    );

    // Then the malformed request is reported
    assertStringIncludes(error.message, "NotificationConfiguration");
  });

  it("rejects a read naming no Bucket", async () => {
    // Given a command with no Bucket
    const simAws = new SimAws();

    // When it is handled
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .s3()
        .getBucketNotificationConfiguration(
          new GetBucketNotificationConfigurationCommand({ Bucket: undefined }),
        ),
    );

    // Then the malformed request is reported
    assertStringIncludes(
      error.message,
      "GetBucketNotificationConfigurationCommand.input.Bucket",
    );
  });
});
