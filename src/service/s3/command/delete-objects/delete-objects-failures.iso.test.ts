import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { DeleteObjectAttempt } from "./delete-object-attempt.js";
import { DeleteObjectsOutcome } from "./delete-objects-outcome.js";

describe("S3 DeleteObjectsCommand partial failures", () => {
  it("deletes the rest of the batch when one key is denied", async () => {
    // Given three Objects, and a Role allowed to delete all but one of them
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simS3 = simAws.account(accountId).region("eu-west-2").s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await Promise.all(
      ["a.txt", "protected.txt", "c.txt"].map(
        async (key) =>
          await simS3.putObject(
            new PutObjectCommand({ Bucket: "uploads", Key: key, Body: key }),
          ),
      ),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PartialCleaner",
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
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "PartialCleaner",
        PolicyName: "DeleteMostObjects",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "s3:DeleteObject",
              Resource: "arn:aws:s3:::uploads/*",
            },
            {
              Effect: "Deny",
              Action: "s3:DeleteObject",
              Resource: "arn:aws:s3:::uploads/protected.txt",
            },
          ],
        }),
      }),
    );

    // When the Role deletes all three in one request
    const output = await simS3.deleteObjects(
      new DeleteObjectsCommand({
        Bucket: "uploads",
        Delete: {
          Objects: [
            { Key: "a.txt" },
            { Key: "protected.txt" },
            { Key: "c.txt" },
          ],
        },
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then the denied key is reported and the other two are still deleted
    assertArrayLength(output.Deleted ?? [], 2);

    const errors = output.Errors ?? [];
    assertArrayLength(errors, 1);
    const refused = errors[0];
    assertNonNullable(refused);
    assertIdentical(refused.Key, "protected.txt");
    assertIdentical(refused.Code, "AccessDenied");
    assertStringIncludes(
      refused.Message,
      "s3:DeleteObject on resource: arn:aws:s3:::uploads/protected.txt",
    );

    const listing = await simS3.listObjects(
      new ListObjectsCommand({ Bucket: "uploads" }),
    );
    const remaining = listing.Contents ?? [];
    assertArrayLength(remaining, 1);
    assertIdentical(remaining[0].Key, "protected.txt");
  });

  it("reports a filesystem-backed Bucket refusing to delete", async () => {
    // Given a Bucket whose storage is a directory on the filesystem
    const directory = new TemporaryDirectory();
    await directory.resolvePath();

    const simS3 = new SimAws().s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "site" }));
    simS3.mountBucketFilesystem("site", directory.join("public"));

    // When a batch deletion is asked for
    const output = await simS3.deleteObjects(
      new DeleteObjectsCommand({
        Bucket: "site",
        Delete: { Objects: [{ Key: "index.html" }] },
      }),
    );

    // Then the refusal is reported per key rather than unlinking a real file
    assertUndefined(output.Deleted);

    const errors = output.Errors ?? [];
    assertArrayLength(errors, 1);
    const refused = errors[0];
    assertNonNullable(refused);
    assertIdentical(refused.Code, "NotImplemented");
    assertStringIncludes(
      refused.Message,
      "will not delete index.html from filesystem-backed storage",
    );
  });

  it("re-raises a failure that is not an S3 one", () => {
    // Given an attempt that failed for a reason the simulator has no S3 code for
    const attempt = new DeleteObjectAttempt(
      "a.txt",
      new TypeError("something went wrong"),
    );

    // When the outcome is collected
    const error = assertThrowsError(() => {
      new DeleteObjectsOutcome([attempt]);
    });

    // Then it is re-raised, so a bug cannot arrive as a per-key AWS error
    assertStringIncludes(error.message, "something went wrong");
  });
});
