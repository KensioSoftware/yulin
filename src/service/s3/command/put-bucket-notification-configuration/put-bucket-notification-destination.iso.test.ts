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
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("The destination a simulated S3 notification configuration names", () => {
  it("refuses a function whose resource policy does not admit S3", async () => {
    // Given a Bucket and a function that grants S3 nothing
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

    // When a configuration names it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
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
      ),
    );

    // Then it is refused the way real S3 refuses a destination it could not
    // validate
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "AddPermission");

    // And nothing is stored
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertUndefined(read.LambdaFunctionConfigurations);
  });

  it("refuses a permission granted for another Bucket", async () => {
    // Given a function that admits S3 only for a different Bucket
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
        StatementId: "AllowOtherBucket",
        Action: "lambda:InvokeFunction",
        Principal: "s3.amazonaws.com",
        SourceArn: "arn:aws:s3:::archive",
      }),
    );

    // When this Bucket's configuration names it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
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
      ),
    );

    // Then the grant for one Bucket does not open the function to another
    assertStringIncludes(error.message, "arn:aws:s3:::uploads");
  });

  it("refuses a function that is not there", async () => {
    // Given a Bucket and no function of that name
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration names it
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
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
      ),
    );

    // Then the missing function is reported rather than stored and never
    // reached
    assertStringIncludes(error.message, "not a simulated Lambda function");
  });

  it("refuses a qualifier naming no version or alias", async () => {
    // Given a Bucket and a function nothing was published from
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

    // When a configuration names a version nothing published
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: `${thumbnailerArn}:3`,
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused rather than read as the unqualified function
    assertStringIncludes(
      error.message,
      "names no simulated Lambda function version or alias",
    );
  });

  it("refuses a Lambda destination ARN naming another service", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When the Lambda destination carries a queue ARN
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: "arn:aws:sqs:us-east-1:888888888888:uploads",
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused for not being a function, rather than delivered to as
    // the queue it names: the destination group a configuration was declared
    // in is what decides where it goes.
    assertStringIncludes(error.message, "is not a Lambda function ARN");
  });

  it("stores without checking when the request asks it to", async () => {
    // Given a Bucket and a function that grants S3 nothing
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

    // When the configuration is applied with SkipDestinationValidation
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        SkipDestinationValidation: true,
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

    // Then it is stored, as real S3 stores an unchecked destination
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertArrayLength(read.LambdaFunctionConfigurations ?? [], 1);
  });
});
