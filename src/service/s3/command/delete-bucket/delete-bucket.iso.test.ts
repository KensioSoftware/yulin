import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimS3BucketNotEmpty,
  SimS3NoSuchBucket,
} from "../../error/sim-s3.error.js";

describe("S3 DeleteBucketCommand", () => {
  const simAws = new SimAws();

  it("deletes an empty Bucket", async () => {
    // Given an empty Bucket.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "disposable-bucket" }),
    );

    // When the Bucket is deleted.
    await simS3.deleteBucket(
      new DeleteBucketCommand({ Bucket: "disposable-bucket" }),
    );

    // Then the Bucket is gone from the scope.
    assertUndefined(simS3.getSimBucketByName("disposable-bucket"));
  });

  it("releases the Bucket name for another Region to claim", async () => {
    // Given a Bucket in one Region, whose name no other Region can take.
    const crossRegionSimAws = new SimAws();
    const euS3 = crossRegionSimAws.region("eu-west-2").s3();
    const usS3 = crossRegionSimAws.region("us-east-1").s3();

    await euS3.createBucket(new CreateBucketCommand({ Bucket: "moving-home" }));
    const takenError = await assertThrowsErrorAsync(async () =>
      usS3.createBucket(new CreateBucketCommand({ Bucket: "moving-home" })),
    );
    assertStringIncludes(takenError.name, "BucketAlreadyOwnedByYou");

    // When the Bucket is deleted in the Region that holds it.
    await euS3.deleteBucket(new DeleteBucketCommand({ Bucket: "moving-home" }));

    // Then the other Region can claim the name, as S3 names are only unique
    // for as long as the Bucket exists.
    await usS3.createBucket(new CreateBucketCommand({ Bucket: "moving-home" }));
    assertUndefined(euS3.getSimBucketByName("moving-home"));
  });

  it("refuses to delete a Bucket that still holds Objects", async () => {
    // Given a Bucket with an Object in it.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "occupied-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "occupied-bucket",
        Key: "left-behind.txt",
        Body: "still here",
      }),
    );

    // When the Bucket is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucket(
        new DeleteBucketCommand({ Bucket: "occupied-bucket" }),
      ),
    );

    // Then S3 refuses, rather than emptying the Bucket for the caller.
    assertInstanceOf(error, SimS3BucketNotEmpty);
    assertIdentical(error.$metadata.httpStatusCode, 409);
    assertInstanceOf(simS3.getSimBucketByName("occupied-bucket"), Object);
  });

  it("deletes a Bucket once its Objects have been removed", async () => {
    // Given a Bucket that has been emptied.
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "emptied-bucket" }),
    );
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "emptied-bucket",
        Key: "temporary.txt",
        Body: "for now",
      }),
    );
    await simS3.deleteObject(
      new DeleteObjectCommand({
        Bucket: "emptied-bucket",
        Key: "temporary.txt",
      }),
    );

    // When the Bucket is deleted.
    await simS3.deleteBucket(
      new DeleteBucketCommand({ Bucket: "emptied-bucket" }),
    );

    // Then it goes, because there is nothing left in it.
    assertUndefined(simS3.getSimBucketByName("emptied-bucket"));
  });

  it("rejects a non-existent Bucket", async () => {
    // Given the top-level simulated S3 service without the requested Bucket.
    const simS3 = simAws.s3();

    // When DeleteBucket targets the missing Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucket(new DeleteBucketCommand({ Bucket: "never-made" })),
    );

    // Then S3 returns its missing-Bucket error.
    assertInstanceOf(error, SimS3NoSuchBucket);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("rejects a missing required Bucket input", async () => {
    // Given the top-level simulated S3 service.
    const simS3 = simAws.s3();

    // When DeleteBucket is called without its required Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucket(
        // @ts-expect-error -- testing invalid input
        new DeleteBucketCommand({}),
      ),
    );

    // Then request validation identifies the missing Bucket input.
    assertStringIncludes(error.message, "DeleteBucketCommand.input.Bucket");
  });

  it("denies a caller without DeleteBucket permission", async () => {
    // Given a Bucket and a Role with no S3 grant.
    const accountId = makeSimAwsAccountId();
    const scopedSimAws = new SimAws({ defaultAccountId: accountId });
    const simIam = scopedSimAws.iam();
    const simS3 = scopedSimAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "protected-bucket" }),
    );
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "UnprivilegedBucketRemover",
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

    // When the unprivileged Role deletes the Bucket.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.deleteBucket(
        new DeleteBucketCommand({ Bucket: "protected-bucket" }),
        { caller: { kind: "arn", arn: roleCreation.Role.Arn } },
      ),
    );

    // Then IAM denies the removal action, and the Bucket stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "s3:DeleteBucket");
    assertIdentical(error.resource, "arn:aws:s3:::protected-bucket");
    assertInstanceOf(simS3.getSimBucketByName("protected-bucket"), Object);
  });
});
