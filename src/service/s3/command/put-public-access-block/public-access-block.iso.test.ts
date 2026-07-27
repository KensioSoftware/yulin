import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeletePublicAccessBlockCommand,
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimS3NoSuchBucket } from "../../error/sim-s3.error.js";

describe("S3 Block Public Access commands", () => {
  const simAws = new SimAws();

  const allBlocked = {
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true,
  };

  it("blocks all public access on a newly created Bucket", async () => {
    // Given a Bucket created with no Block Public Access configuration.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "fresh" }));

    // When its settings are read.
    const output = await simS3.getPublicAccessBlock(
      new GetPublicAccessBlockCommand({ Bucket: "fresh" }),
    );

    // Then all four are enabled, as on every new Bucket in real S3.
    assertObjectEquals(output.PublicAccessBlockConfiguration, allBlocked);
  });

  it("replaces the whole configuration, turning omitted settings off", async () => {
    // Given a Bucket at the all-blocked default.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "partial" }));

    // When a configuration naming only the two ACL settings is applied, as
    // CDK's BlockPublicAccess.BLOCK_ACLS preset synthesizes.
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "partial",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
        },
      }),
    );

    // Then the settings it left out are off, because the configuration
    // replaces the previous one rather than merging into it.
    const output = await simS3.getPublicAccessBlock(
      new GetPublicAccessBlockCommand({ Bucket: "partial" }),
    );

    assertObjectEquals(output.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: false,
      RestrictPublicBuckets: false,
    });
  });

  it("returns the Bucket to fully blocked when the configuration is deleted", async () => {
    // Given a Bucket with every setting turned off.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "reopened" }));
    await simS3.putPublicAccessBlock(
      new PutPublicAccessBlockCommand({
        Bucket: "reopened",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      }),
    );

    // When the configuration is deleted.
    await simS3.deletePublicAccessBlock(
      new DeletePublicAccessBlockCommand({ Bucket: "reopened" }),
    );

    // Then the Bucket is blocked again rather than left unprotected.
    const output = await simS3.getPublicAccessBlock(
      new GetPublicAccessBlockCommand({ Bucket: "reopened" }),
    );

    assertObjectEquals(output.PublicAccessBlockConfiguration, allBlocked);
  });

  it("rejects a non-existent Bucket", async () => {
    // Given the top-level simulated S3 service without the requested Bucket.
    const simS3 = simAws.s3();

    // When each command targets the missing Bucket.
    const readError = await assertThrowsErrorAsync(async () =>
      simS3.getPublicAccessBlock(
        new GetPublicAccessBlockCommand({ Bucket: "absent" }),
      ),
    );
    const writeError = await assertThrowsErrorAsync(async () =>
      simS3.putPublicAccessBlock(
        new PutPublicAccessBlockCommand({
          Bucket: "absent",
          PublicAccessBlockConfiguration: {},
        }),
      ),
    );
    const removalError = await assertThrowsErrorAsync(async () =>
      simS3.deletePublicAccessBlock(
        new DeletePublicAccessBlockCommand({ Bucket: "absent" }),
      ),
    );

    // Then S3 returns its missing-Bucket error each time.
    assertInstanceOf(readError, SimS3NoSuchBucket);
    assertInstanceOf(writeError, SimS3NoSuchBucket);
    assertInstanceOf(removalError, SimS3NoSuchBucket);
  });

  it("rejects missing required request inputs", async () => {
    // Given the top-level simulated S3 service.
    const simS3 = simAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "inputs" }));

    // When the commands are called without their required inputs.
    const bucketError = await assertThrowsErrorAsync(async () =>
      simS3.getPublicAccessBlock(
        // @ts-expect-error -- testing invalid input
        new GetPublicAccessBlockCommand({}),
      ),
    );
    const configError = await assertThrowsErrorAsync(async () =>
      simS3.putPublicAccessBlock(
        // @ts-expect-error -- testing invalid input
        new PutPublicAccessBlockCommand({ Bucket: "inputs" }),
      ),
    );
    const removalError = await assertThrowsErrorAsync(async () =>
      simS3.deletePublicAccessBlock(
        // @ts-expect-error -- testing invalid input
        new DeletePublicAccessBlockCommand({}),
      ),
    );

    // Then request validation names the missing input.
    assertStringIncludes(
      bucketError.message,
      "GetPublicAccessBlockCommand.input.Bucket",
    );
    assertStringIncludes(
      configError.message,
      "PutPublicAccessBlockCommand.input.PublicAccessBlockConfiguration",
    );
    assertStringIncludes(
      removalError.message,
      "DeletePublicAccessBlockCommand.input.Bucket",
    );
  });

  it("denies a caller without the Block Public Access permissions", async () => {
    // Given a Role granted only the read side of the configuration.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "guarded" }));
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PublicAccessAuditor",
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
        RoleName: "PublicAccessAuditor",
        PolicyName: "ReadPublicAccessBlock",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetBucketPublicAccessBlock",
            Resource: "arn:aws:s3:::guarded",
          },
        }),
      }),
    );
    const caller = { kind: "arn", arn: roleCreation.Role.Arn } as const;

    // When the Role reads, then tries to change the configuration.
    const readOutput = await simS3.getPublicAccessBlock(
      new GetPublicAccessBlockCommand({ Bucket: "guarded" }),
      { caller },
    );
    const writeError = await assertThrowsErrorAsync(async () =>
      simS3.putPublicAccessBlock(
        new PutPublicAccessBlockCommand({
          Bucket: "guarded",
          PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
        }),
        { caller },
      ),
    );

    // Then the read succeeds and the write is denied on the distinct action.
    assertObjectEquals(readOutput.PublicAccessBlockConfiguration, allBlocked);
    assertInstanceOf(writeError, SimIamAccessDenied);
    assertIdentical(writeError.action, "s3:PutBucketPublicAccessBlock");
  });

  it("governs deletion with the same permission as replacement", async () => {
    // Given a Role granted only the read permission.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "undeletable" }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PublicAccessRemover",
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

    // When it tries to delete the configuration.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deletePublicAccessBlock(
        new DeletePublicAccessBlockCommand({ Bucket: "undeletable" }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then S3 asks for the put permission, having no separate delete one.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:PutBucketPublicAccessBlock");
  });
});
