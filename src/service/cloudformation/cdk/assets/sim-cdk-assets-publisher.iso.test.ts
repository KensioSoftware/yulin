import path from "node:path";
import { buffer } from "node:stream/consumers";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it, vi } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import type { SimCdkAssetsManifest } from "../sim-cdk-out-context.js";
import { SimCdkAssetsPublisher } from "./sim-cdk-assets-publisher.js";

const defaultScope = { accountId: "888888888888", regionName: "us-east-1" };

/**
 * A CDK pseudo-parameter reference, as an environment-agnostic Stack's assets
 * manifest templates its staging Bucket name with.
 */
function pseudoParameter(name: string): string {
  return `\${${name}}`;
}

/**
 * Publish a manifest against a temporary cloud assembly directory.
 */
async function publish(
  simAws: SimAws,
  templateDirectoryPath: string,
  assetsManifest: SimCdkAssetsManifest,
): Promise<void> {
  await new SimCdkAssetsPublisher({
    simAws,
    accountRegionScope: simAws.accountRegionScope().accountRegionScope,
    stackName: "TestStack",
    cdkOutContext: { templateDirectoryPath, assetsManifest },
  }).publish();
}

/**
 * Read a published object body back out of sim S3.
 */
async function publishedObjectBytes(
  simAws: SimAws,
  bucketName: string,
  objectKey: string,
): Promise<Uint8Array> {
  const output = await simAws
    .s3()
    .getObject({ input: { Bucket: bucketName, Key: objectKey } });
  assertNonNullable(output.Body);

  return await buffer(output.Body);
}

describe("SimCdkAssetsPublisher", () => {
  it("zips a staged asset directory into the staging Bucket", async () => {
    // Given a cloud assembly with a multi-file zip-packaged asset directory.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile(
      ["asset.abc123", "index.js"],
      "exports.handler = async () => 'asset';",
    );
    await cdkOutDirectory.writeFile(
      ["asset.abc123", "lib", "helper.js"],
      "exports.help = () => 'helped';",
    );

    // When the assembly's assets are published.
    await publish(simAws, cdkOutDirectory.path(), {
      files: {
        abc123: {
          source: { path: "asset.abc123", packaging: "zip" },
          destinations: {
            "current_account-current_region": {
              bucketName:
                `cdk-hnb659fds-assets-${pseudoParameter("AWS::AccountId")}` +
                `-${pseudoParameter("AWS::Region")}`,
              objectKey: "abc123.zip",
            },
          },
        },
      },
    });

    // Then the staging Bucket is created with the pseudo parameters resolved
    // against the deploying scope.
    const bucketName = `cdk-hnb659fds-assets-${defaultScope.accountId}-${defaultScope.regionName}`;
    assertNonNullable(simAws.s3().getSimBucketByName(bucketName));

    // And the whole directory was zipped, preserving archive paths.
    const archive = SimZipArchive.fromBytes(
      await publishedObjectBytes(simAws, bucketName, "abc123.zip"),
    );
    assertIdentical(
      archive.file("index.js").toString(),
      "exports.handler = async () => 'asset';",
    );
    assertIdentical(
      archive.file("lib/helper.js").toString(),
      "exports.help = () => 'helped';",
    );
  });

  it("publishes a file-packaged asset byte for byte", async () => {
    // Given a cloud assembly with an already-zipped file asset.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile("TestStack.template.json", '{"a":1}');

    // When the assembly's assets are published.
    await publish(simAws, cdkOutDirectory.path(), {
      files: {
        def456: {
          source: { path: "TestStack.template.json", packaging: "file" },
          destinations: {
            "current_account-current_region": {
              bucketName: "staging-bucket",
              objectKey: "def456.json",
            },
          },
        },
      },
    });

    // Then the file content is published unchanged, not zipped.
    const objectBytes = await publishedObjectBytes(
      simAws,
      "staging-bucket",
      "def456.json",
    );
    assertIdentical(Buffer.from(objectBytes).toString(), '{"a":1}');
  });

  it("publishes several assets and destinations into one staging Bucket", async () => {
    // Given two assets sharing a staging Bucket, one with two destinations.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile("first.txt", "first");
    await cdkOutDirectory.writeFile("second.txt", "second");

    // When the assembly's assets are published.
    await publish(simAws, cdkOutDirectory.path(), {
      files: {
        first: {
          source: { path: "first.txt", packaging: "file" },
          destinations: {
            one: { bucketName: "staging-bucket", objectKey: "first.txt" },
            two: { bucketName: "staging-bucket", objectKey: "first-copy.txt" },
          },
        },
        second: {
          source: { path: "second.txt", packaging: "file" },
          destinations: {
            one: { bucketName: "staging-bucket", objectKey: "second.txt" },
          },
        },
      },
    });

    // Then the Bucket is reused rather than recreated, and holds every object.
    const listed = await simAws
      .s3()
      .listObjects({ input: { Bucket: "staging-bucket" } });
    assertArrayLength(listed.Contents ?? [], 3);
  });

  it("skips a Bucket name it cannot fully resolve", async () => {
    // Given a Bucket name templated with something that is not a supported
    // CloudFormation pseudo parameter, so it cannot name a real Bucket.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile("asset.txt", "content");

    // When the assembly's assets are published.
    await publish(simAws, cdkOutDirectory.path(), {
      files: {
        abc: {
          source: { path: "asset.txt", packaging: "file" },
          destinations: {
            one: {
              bucketName:
                `staging-${pseudoParameter("Unknown")}` +
                `-${pseudoParameter("AWS::Region")}`,
              objectKey: "abc.txt",
            },
          },
        },
      },
    });

    // Then publishing declines rather than failing the Stack deployment with
    // an invalid Bucket name.
    const listed = await simAws.s3().listBuckets({ input: {} });
    assertArrayLength(listed.Buckets ?? [], 0);
  });

  it("does nothing without a cloud assembly", async () => {
    // Given a Stack deployed from an inline template, so no CDK out context.
    const simAws = new SimAws();

    // When publishing runs anyway.
    await new SimCdkAssetsPublisher({
      simAws,
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      stackName: "TestStack",
    }).publish();

    // Then no staging Bucket is created.
    const listed = await simAws.s3().listBuckets({ input: {} });
    assertArrayLength(listed.Buckets ?? [], 0);
  });

  it("skips assets the cloud assembly does not describe or contain", async () => {
    // Given assets that cannot be published: no source path, no destinations,
    // a source path escaping the assembly, a source file that is not there,
    // and destinations missing a Bucket name or object key.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile("present.txt", "present");

    // When the assembly's assets are published.
    await publish(simAws, cdkOutDirectory.path(), {
      files: {
        noSourcePath: {
          source: { packaging: "file" },
          destinations: { one: { bucketName: "b", objectKey: "k" } },
        },
        noDestinations: {
          source: { path: "present.txt", packaging: "file" },
          destinations: {},
        },
        escapingPath: {
          source: {
            path: path.join("..", "outside.txt"),
            packaging: "file",
          },
          destinations: { one: { bucketName: "b", objectKey: "k" } },
        },
        missingFile: {
          source: { path: "absent.txt", packaging: "file" },
          destinations: { one: { bucketName: "b", objectKey: "k" } },
        },
        noBucketName: {
          source: { path: "present.txt", packaging: "file" },
          destinations: { one: { objectKey: "k" } },
        },
        noObjectKey: {
          source: { path: "present.txt", packaging: "file" },
          destinations: { one: { bucketName: "b" } },
        },
      },
    });

    // Then nothing was published, and the Stack deployment is left to report
    // the missing code through the ordinary sim S3 lookup.
    assertUndefined(simAws.s3().getSimBucketByName("b"));
  });

  it("publishes into a staging Bucket another Stack created concurrently", async () => {
    // Given a staging Bucket that appears between the publisher checking for
    // it and its own CreateBucket landing, as it can when two Stacks sharing
    // one staging Bucket deploy concurrently.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile("asset.txt", "content");

    const s3 = simAws.s3();
    await s3.createBucket({ input: { Bucket: "shared-staging-bucket" } });

    const findBucket = s3.getSimBucketByName.bind(s3);
    let checkedBeforeCreate = false;
    vi.spyOn(s3, "getSimBucketByName").mockImplementation((bucketName) => {
      if (checkedBeforeCreate) {
        return findBucket(bucketName);
      }
      checkedBeforeCreate = true;

      return undefined;
    });

    // When the assets are published.
    await publish(simAws, cdkOutDirectory.path(), {
      files: {
        abc: {
          source: { path: "asset.txt", packaging: "file" },
          destinations: {
            one: { bucketName: "shared-staging-bucket", objectKey: "abc.txt" },
          },
        },
      },
    });

    // Then losing the race to create the Bucket is not a failure, and the
    // asset is published into the Bucket that won.
    const objectBytes = await publishedObjectBytes(
      simAws,
      "shared-staging-bucket",
      "abc.txt",
    );
    assertIdentical(Buffer.from(objectBytes).toString(), "content");
  });

  it("reports a staging Bucket name already taken in another scope", async () => {
    // Given the staging Bucket name already in use in another Region, which
    // sim S3 refuses because Bucket names are globally unique.
    const simAws = new SimAws();
    const cdkOutDirectory = new TemporaryDirectory();
    await cdkOutDirectory.writeFile("asset.txt", "content");

    await simAws
      .accountRegionScope(undefined, "eu-west-2")
      .s3()
      .createBucket({ input: { Bucket: "taken-staging-bucket" } });

    // When publishing tries to create it in the deploying scope.
    const error = await assertThrowsErrorAsync(async () => {
      await publish(simAws, cdkOutDirectory.path(), {
        files: {
          abc: {
            source: { path: "asset.txt", packaging: "file" },
            destinations: {
              one: { bucketName: "taken-staging-bucket", objectKey: "abc.txt" },
            },
          },
        },
      });
    });

    // Then the failure is reported rather than mistaken for a lost race.
    assertStringIncludes(error.message, "taken-staging-bucket");
  });
});
