import {
  CreateBucketCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

describe("IAM authorization of the S3 notification configuration commands", () => {
  it("authorizes replacing the configuration as s3:PutBucketNotification", async () => {
    // Given a Role allowed only to read the configuration. The IAM action
    // names do not match the API names, which is what this is about.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "NotificationReader",
        actions: ["s3:GetBucketNotification"],
        resource: "arn:aws:s3:::uploads",
      },
      simAws,
    );

    // When it applies a configuration
    const error = await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {},
        }),
        { caller: { kind: "arn", arn: role.Arn } },
      ),
    );

    // Then it is denied, and nothing is stored
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "s3:PutBucketNotification");
  });

  it("allows a Role holding s3:PutBucketNotification", async () => {
    // Given a Role allowed to replace the configuration
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "NotificationWriter",
        actions: ["s3:PutBucketNotification"],
        resource: "arn:aws:s3:::uploads",
      },
      simAws,
    );

    // When it applies an empty configuration
    await simAws.s3().putBucketNotificationConfiguration(
      new PutBucketNotificationConfigurationCommand({
        Bucket: "uploads",
        NotificationConfiguration: {},
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the request goes through
    const read = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertUndefined(read.LambdaFunctionConfigurations);
  });

  it("authorizes reading the configuration as s3:GetBucketNotification", async () => {
    // Given a Role allowed only to replace the configuration
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "NotificationWriter",
        actions: ["s3:PutBucketNotification"],
        resource: "arn:aws:s3:::uploads",
      },
      simAws,
    );

    // When it reads the configuration
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .s3()
        .getBucketNotificationConfiguration(
          new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
          { caller: { kind: "arn", arn: role.Arn } },
        ),
    );

    // Then it is denied: the two permissions are separate
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "s3:GetBucketNotification");
  });
});
