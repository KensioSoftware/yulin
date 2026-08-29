import {
  AddPermissionCommand,
  CreateFunctionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("Delivering a simulated S3 event notification", () => {
  it("stops delivering when the permission is removed afterwards", async () => {
    // Given a configured Bucket whose function allowed S3 to invoke it
    const simAws = new SimAws();
    let invocations = 0;
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            invocations += 1;

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

    // When the permission is taken away and an Object is written
    await simAws.lambda().removePermission(
      new RemovePermissionCommand({
        FunctionName: "thumbnailer",
        StatementId: "AllowS3",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing is delivered: the resource policy is checked again for
    // every event, rather than remembered from configuration time
    assertIdentical(invocations, 0);
    const failures = simAws.s3().getNotificationDeliveryFailures();
    assertArrayLength(failures, 1);
    assertTrue(failures[0].wasRefused);
    assertStringIncludes(failures[0].reason, "does not allow");
  });

  it("does not fail the PutObject when the handler throws", async () => {
    // Given a configured Bucket whose function fails on every invocation
    const simAws = new SimAws();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: "arn:aws:iam::888888888888:role/ThumbnailerRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => {
            throw new Error("could not read the image");
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

    // When two Objects are written
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
        Key: "dog.jpg",
        Body: "dog",
      }),
    );

    // Then waiting for the simulation to settle does not raise the handler's
    // failure, as real S3 tells the writer nothing about a delivery
    await simAws.backgroundTasksComplete();

    // And both failures are there to be read, warned about once between them
    const failures = simAws.s3().getNotificationDeliveryFailures();
    assertArrayLength(failures, 2);
    assertStringIncludes(failures[0].reason, "could not read the image");
    assertArrayLength(warn.mock.calls, 1);
    warn.mockRestore();
  });

  it("stops a notification loop rather than running forever", async () => {
    // Given a Bucket whose handler writes back into the Bucket that triggered
    // it, with no filter to keep its own writes out
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    const executionRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "ThumbnailerRole", actions: ["s3:PutObject"] },
      simAws,
    );
    let written = 0;
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "thumbnailer",
        Role: executionRole.Arn,
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            written += 1;

            await simAws.s3().putObject(
              new PutObjectCommand({
                Bucket: "uploads",
                Key: `thumb-${String(written)}.jpg`,
                Body: "thumbnail",
              }),
            );

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

    // When the first Object starts it off
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat",
      }),
    );

    // Then the simulation gives up with something to read, rather than
    // draining background work that never runs out
    let raised: unknown;
    try {
      await simAws.backgroundTasksComplete();
    } catch (error) {
      raised = error;
    }

    assertInstanceOf(raised, Error);
    assertStringIncludes(raised.message, "notifies itself forever");
  });
});
