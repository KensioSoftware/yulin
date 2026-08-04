import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3 } from "../../sim-s3.js";

const thumbnailerArn =
  "arn:aws:lambda:us-east-1:888888888888:function:thumbnailer";

describe("What a simulated S3 notification configuration refuses", () => {
  it("refuses a filter rule name S3 does not filter on", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration filters on something else. The SDK's own types
    // refuse this, so the request is built structurally, the way one arriving
    // over the REST endpoint would be.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration({
        input: {
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: { FilterRules: [{ Name: "contains", Value: "raw" }] },
                },
              },
            ],
          },
        },
      }),
    );

    // Then the rule name is refused by name
    assertStringIncludes(error.message, "contains");
  });

  it("refuses a filter rule name given twice", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration states two prefixes
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: {
                    FilterRules: [
                      { Name: "prefix", Value: "raw/" },
                      { Name: "prefix", Value: "cooked/" },
                    ],
                  },
                },
              },
            ],
          },
        }),
      ),
    );

    // Then the repeated rule is refused rather than one of them winning
    assertStringIncludes(error.message, "more than once");
  });

  it("refuses a configuration id used twice", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When two configurations share an id
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
                Filter: {
                  Key: { FilterRules: [{ Name: "suffix", Value: ".jpg" }] },
                },
              },
              {
                Id: "thumbnails",
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: {
                  Key: { FilterRules: [{ Name: "suffix", Value: ".png" }] },
                },
              },
            ],
          },
        }),
      ),
    );

    // Then the repeated id is reported
    assertIdentical(error.name, "InvalidArgument");
    assertStringIncludes(error.message, "used more than once");
  });

  it("refuses a configuration naming no events", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration names no event types
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              { Id: "nothing", Events: [], LambdaFunctionArn: thumbnailerArn },
            ],
          },
        }),
      ),
    );

    // Then it is refused rather than stored as a configuration for nothing
    assertStringIncludes(error.message, "names no events");
  });

  it("refuses a configuration naming no function", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration has no LambdaFunctionArn. The SDK's own types
    // require one, so the request is built structurally, the way one arriving
    // over the REST endpoint would be.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration({
        input: {
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              { Id: "nowhere", Events: ["s3:ObjectCreated:*"] },
            ],
          },
        },
      }),
    );

    // Then the missing destination is reported
    assertStringIncludes(error.message, "LambdaFunctionArn");
  });

  it("refuses a destination that is not an ARN at all", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When the destination is a bare function name
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: "thumbnailer",
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused for not being a function ARN
    assertStringIncludes(error.message, "is not a Lambda function ARN");
  });

  it("refuses a configuration carrying no events at all", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a configuration leaves Events out entirely. The SDK's own types
    // require it, so the request is built structurally, the way one arriving
    // over the REST endpoint would be.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration({
        input: {
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              { LambdaFunctionArn: thumbnailerArn },
            ],
          },
        },
      }),
    );

    // Then it is refused the same way an empty event list is
    assertStringIncludes(error.message, "names no events");
  });

  it("refuses a filter rule with no name", async () => {
    // Given a Bucket
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a filter rule states a value and no name
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            LambdaFunctionConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                LambdaFunctionArn: thumbnailerArn,
                Filter: { Key: { FilterRules: [{ Value: "raw/" }] } },
              },
            ],
          },
        }),
      ),
    );

    // Then the rule is refused, saying it named nothing
    assertStringIncludes(error.message, "(none)");
  });

  it("refuses a simulated S3 built on its own", async () => {
    // Given a SimS3 constructed outside SimAws, which has no other simulated
    // services and no shared background scheduler
    const simS3 = new SimS3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

    // When a notification configuration is applied to one of its Buckets
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketNotificationConfiguration(
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

    // Then it says so, and points at SimAws
    assertStringIncludes(error.message, "constructed on its own");
    assertStringIncludes(error.message, "SimAws");
  });
});
