import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDeployedStack } from "../../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";

/**
 * Deploy a change-log Bucket declaring the given versioning configuration.
 */
async function deployBucket(
  simAws: SimAws,
  versioning: SimCfnTemplateValue,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "history-stack",
    template: {
      Resources: {
        HistoryBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "history",
            VersioningConfiguration: versioning,
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  return stack;
}

describe("AWS::S3::Bucket VersioningConfiguration", () => {
  it("deploys a Bucket that answers GetBucketVersioning with its status", async () => {
    // Given a template declaring a versioned Bucket
    const simAws = new SimAws();

    // When it is deployed and the Bucket is asked how it is versioned
    const stack = await deployBucket(simAws, { Status: "Enabled" });
    const status = await simAws
      .s3()
      .getBucketVersioning(
        new GetBucketVersioningCommand({ Bucket: "history" }),
      );

    // Then the property reached the Bucket rather than being recorded as one
    // the simulation cannot act on.
    assertIdentical(status.Status, "Enabled");
    assertArrayLength(stack.ignoredProperties, 0);
  });

  it("keeps versions in a Bucket a template versioned", async () => {
    // Given a deployed versioned Bucket holding two writes of one key
    const simAws = new SimAws();
    await deployBucket(simAws, { Status: "Enabled" });
    const s3 = simAws.s3();
    await s3.putObject(
      new PutObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
        Body: "first",
      }),
    );
    await s3.putObject(
      new PutObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
        Body: "second",
      }),
    );

    // When the key is deleted and the versions are listed
    await s3.deleteObject(
      new DeleteObjectCommand({
        Bucket: "history",
        Key: "events/reader-1.json",
      }),
    );
    const listed = await s3.listObjectVersions(
      new ListObjectVersionsCommand({ Bucket: "history" }),
    );

    // Then both writes are still there, under a delete marker that hides them.
    assertArrayLength(listed.Versions ?? [], 2);
    const markers = listed.DeleteMarkers ?? [];
    assertArrayLength(markers, 1);
    const marker = markers[0];
    assertNonNullable(marker);
    assertTrue(marker.IsLatest);
  });

  it("fails a stack whose VersioningConfiguration is not a status", async () => {
    // Given a template whose VersioningConfiguration asks for a status S3 has
    // no meaning for
    const simAws = new SimAws();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () =>
      deployBucket(simAws, { Status: "On" }),
    );

    // Then the stack fails on the same refusal an SDK caller would get, rather
    // than deploying a Bucket that is versioned in some third way.
    assertStringIncludes(error.message, "Enabled or Suspended");
  });
});
