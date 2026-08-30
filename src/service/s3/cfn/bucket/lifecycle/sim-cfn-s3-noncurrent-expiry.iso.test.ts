import {
  ListObjectVersionsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { assertArrayEquals, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimS3 } from "../../../sim-s3.js";

const bucketName = "reader-history";
const key = "snapshots/reader-1.json";

/** Write one snapshot, answering the version it was given. */
async function putSnapshot(s3: SimS3, body: string): Promise<string> {
  const put = await s3.putObject(
    new PutObjectCommand({ Bucket: bucketName, Key: key, Body: body }),
  );

  assertNonNullable(put.VersionId);

  return put.VersionId;
}

/** The version ids a listing reports, newest first. */
async function listedVersions(s3: SimS3): Promise<readonly string[]> {
  const listed = await s3.listObjectVersions(
    new ListObjectVersionsCommand({ Bucket: bucketName }),
  );

  return (listed.Versions ?? []).map((version) => version.VersionId);
}

describe("AWS::S3::Bucket NoncurrentVersionExpiration", () => {
  it("expires a version a template's flattened rule names", async () => {
    // Given a Bucket deployed from a template stating the older
    // NoncurrentVersionExpirationInDays, which is what CDK synthesises for
    // noncurrentVersionExpiration.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "history-stack",
      template: {
        Resources: {
          HistoryBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: bucketName,
              VersioningConfiguration: { Status: "Enabled" },
              LifecycleConfiguration: {
                Rules: [
                  {
                    Id: "expire-noncurrent",
                    Status: "Enabled",
                    Prefix: "snapshots/",
                    NoncurrentVersionExpirationInDays: 90,
                  },
                ],
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const s3 = simAws.s3();
    await putSnapshot(s3, "before");
    const second = await putSnapshot(s3, "after");

    // When simulated time passes the ninety days.
    await simAws.clock().advanceBy({ days: 91 });

    // Then the displaced version is gone, the same as one a request named.
    assertArrayEquals(await listedVersions(s3), [second]);
  });
  it("expires a version a template's nested rule names", async () => {
    // Given a template stating the nested NoncurrentVersionExpiration the
    // request itself takes, rather than the flattened field beside it.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "history-stack",
      template: {
        Resources: {
          HistoryBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: bucketName,
              VersioningConfiguration: { Status: "Enabled" },
              LifecycleConfiguration: {
                Rules: [
                  {
                    Id: "expire-noncurrent",
                    Status: "Enabled",
                    Prefix: "snapshots/",
                    NoncurrentVersionExpiration: {
                      NoncurrentDays: 90,
                      NewerNoncurrentVersions: 1,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const s3 = simAws.s3();
    await putSnapshot(s3, "one");
    const second = await putSnapshot(s3, "two");
    const current = await putSnapshot(s3, "three");

    // When the ninety days pass.
    await simAws.clock().advanceBy({ days: 91 });

    // Then the count the nested rule carried is honoured too.
    assertArrayEquals(await listedVersions(s3), [current, second]);
  });
});
