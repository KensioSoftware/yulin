import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteBucketLifecycleCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimS3NoSuchBucket,
  SimS3NoSuchLifecycleConfiguration,
} from "../../error/sim-s3.error.js";

describe("S3 lifecycle configuration commands", () => {
  const expireRawLogs = {
    ID: "expire-raw-logs",
    Status: "Enabled",
    Filter: { Prefix: "raw/" },
    Expiration: { Days: 365 },
  } as const;

  const abortUploads = {
    ID: "abort-incomplete-uploads",
    Status: "Enabled",
    Filter: { Prefix: "" },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
  } as const;

  it("hands back the rules a Bucket was configured with", async () => {
    // Given a Bucket carrying a retention rule and an upload rule.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "logs",
        LifecycleConfiguration: { Rules: [expireRawLogs, abortUploads] },
      }),
    );

    // When the configuration is read back.
    const output = await simS3.getBucketLifecycleConfiguration(
      new GetBucketLifecycleConfigurationCommand({ Bucket: "logs" }),
    );

    // Then every field of both rules survives the round trip. Nothing expires
    // against them, so what they say is all a test can check.
    assertArrayLength(output.Rules, 2);
    assertObjectEquals(output.Rules[0], expireRawLogs);
    assertObjectEquals(output.Rules[1], abortUploads);
  });

  it("replaces the whole configuration, dropping rules left out", async () => {
    // Given a Bucket carrying two rules.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "replaced" }));
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "replaced",
        LifecycleConfiguration: { Rules: [expireRawLogs, abortUploads] },
      }),
    );

    // When a configuration naming only one of them is applied.
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "replaced",
        LifecycleConfiguration: { Rules: [abortUploads] },
      }),
    );

    // Then the rule it left out is gone, because a put replaces the previous
    // configuration rather than merging into it.
    const output = await simS3.getBucketLifecycleConfiguration(
      new GetBucketLifecycleConfigurationCommand({ Bucket: "replaced" }),
    );

    assertArrayLength(output.Rules, 1);
    assertObjectEquals(output.Rules[0], abortUploads);
  });

  it("reports a Bucket nobody configured rather than an empty list", async () => {
    // Given a Bucket created with no lifecycle configuration.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "fresh" }));

    // When its configuration is read.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getBucketLifecycleConfiguration(
        new GetBucketLifecycleConfigurationCommand({ Bucket: "fresh" }),
      ),
    );

    // Then S3 says there is none, which is how real S3 separates a Bucket
    // nobody configured from one configured to do nothing.
    assertInstanceOf(error, SimS3NoSuchLifecycleConfiguration);
  });

  it("leaves a Bucket unconfigured once its rules are deleted", async () => {
    // Given a Bucket carrying a retention rule.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "cleared" }));
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "cleared",
        LifecycleConfiguration: { Rules: [expireRawLogs] },
      }),
    );

    // When the configuration is deleted twice over.
    await simS3.deleteBucketLifecycle(
      new DeleteBucketLifecycleCommand({ Bucket: "cleared" }),
    );
    await simS3.deleteBucketLifecycle(
      new DeleteBucketLifecycleCommand({ Bucket: "cleared" }),
    );

    // Then the Bucket reads as unconfigured, and the second deletion was as
    // acceptable as the first because real S3 makes this idempotent.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getBucketLifecycleConfiguration(
        new GetBucketLifecycleConfigurationCommand({ Bucket: "cleared" }),
      ),
    );

    assertInstanceOf(error, SimS3NoSuchLifecycleConfiguration);
  });

  it("keeps the caller's rules out of the Bucket's own state", async () => {
    // Given a Bucket configured from a rule object the caller still holds.
    const simS3 = new SimAws().s3();
    const rule = {
      ID: "expire-raw-logs",
      Status: "Enabled" as const,
      Expiration: { Days: 365 },
    };

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "isolated" }));
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "isolated",
        LifecycleConfiguration: { Rules: [rule] },
      }),
    );

    // When the caller mutates that object, and mutates what a read gives it.
    rule.Expiration.Days = 1;
    const firstRead = await simS3.getBucketLifecycleConfiguration(
      new GetBucketLifecycleConfigurationCommand({ Bucket: "isolated" }),
    );
    assertNonNullable(firstRead.Rules[0]);
    // A read result is readonly to a TypeScript caller, so this reaches past
    // the type. The isolation being tested is in the value, not the type.
    (firstRead.Rules[0] as { Status: string }).Status = "Disabled";

    // Then the Bucket still reads back what it was configured with. Changing
    // a Bucket's configuration takes another write.
    const secondRead = await simS3.getBucketLifecycleConfiguration(
      new GetBucketLifecycleConfigurationCommand({ Bucket: "isolated" }),
    );

    assertObjectEquals(secondRead.Rules[0], {
      ID: "expire-raw-logs",
      Status: "Enabled",
      Expiration: { Days: 365 },
    });
  });

  it("rejects a non-existent Bucket", async () => {
    // Given simulated S3 without the requested Bucket.
    const simS3 = new SimAws().s3();

    // When each command targets the missing Bucket.
    const readError = await assertThrowsErrorAsync(async () =>
      simS3.getBucketLifecycleConfiguration(
        new GetBucketLifecycleConfigurationCommand({ Bucket: "absent" }),
      ),
    );
    const writeError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "absent",
          LifecycleConfiguration: { Rules: [expireRawLogs] },
        }),
      ),
    );
    const removalError = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketLifecycle(
        new DeleteBucketLifecycleCommand({ Bucket: "absent" }),
      ),
    );

    // Then S3 returns its missing-Bucket error each time.
    assertInstanceOf(readError, SimS3NoSuchBucket);
    assertInstanceOf(writeError, SimS3NoSuchBucket);
    assertInstanceOf(removalError, SimS3NoSuchBucket);
  });

  it("rejects missing required request inputs", async () => {
    // Given a Bucket to send incomplete requests to.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "inputs" }));

    // When the commands are called without their required inputs.
    const bucketError = await assertThrowsErrorAsync(async () =>
      simS3.getBucketLifecycleConfiguration(
        // @ts-expect-error -- testing invalid input
        new GetBucketLifecycleConfigurationCommand({}),
      ),
    );
    const configError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({ Bucket: "inputs" }),
      ),
    );
    const removalError = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketLifecycle(
        // @ts-expect-error -- testing invalid input
        new DeleteBucketLifecycleCommand({}),
      ),
    );

    // Then request validation names the missing input.
    assertStringIncludes(
      bucketError.message,
      "GetBucketLifecycleConfigurationCommand.input.Bucket",
    );
    assertStringIncludes(
      configError.message,
      "PutBucketLifecycleConfigurationCommand.input.LifecycleConfiguration",
    );
    assertStringIncludes(
      removalError.message,
      "DeleteBucketLifecycleCommand.input.Bucket",
    );
  });

  it("denies a caller granted only the read permission", async () => {
    // Given a Role granted the read side of the configuration and no more.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "guarded" }));
    await simS3.putBucketLifecycleConfiguration(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: "guarded",
        LifecycleConfiguration: { Rules: [expireRawLogs] },
      }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "LifecycleAuditor",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "LifecycleAuditor",
        PolicyName: "ReadLifecycleConfiguration",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetLifecycleConfiguration",
            Resource: "arn:aws:s3:::guarded",
          },
        }),
      }),
    );
    const caller = { kind: "arn", arn: roleCreation.Role.Arn } as const;

    // When the Role reads, then tries to change and to remove the rules.
    const readOutput = await simS3.getBucketLifecycleConfiguration(
      new GetBucketLifecycleConfigurationCommand({ Bucket: "guarded" }),
      { caller },
    );
    const writeError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "guarded",
          LifecycleConfiguration: { Rules: [abortUploads] },
        }),
        { caller },
      ),
    );
    const removalError = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucketLifecycle(
        new DeleteBucketLifecycleCommand({ Bucket: "guarded" }),
        { caller },
      ),
    );

    // Then the read succeeds and both writes are denied on the one action S3
    // governs replacement and removal with.
    assertArrayLength(readOutput.Rules, 1);
    assertInstanceOf(writeError, SimIamAccessDenied);
    assertIdentical(writeError.action, "s3:PutLifecycleConfiguration");
    assertInstanceOf(removalError, SimIamAccessDenied);
    assertIdentical(removalError.action, "s3:PutLifecycleConfiguration");
  });
});
