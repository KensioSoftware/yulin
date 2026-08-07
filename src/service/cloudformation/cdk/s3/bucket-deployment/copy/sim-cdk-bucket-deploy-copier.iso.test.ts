import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../template/value/sim-cfn-template-value.js";
import { SimS3Bucket } from "../../../../../s3/bucket/sim-s3-bucket.js";
import {
  SimS3Object,
  SimS3ObjectMetadata,
} from "../../../../../s3/object/s3-object.js";
import { TemporaryDirectory } from "../../../../../../util/filesystem/temporary-directory.js";
import { SimCdkBucketDeployProperties } from "../property/sim-cdk-bucket-deploy-properties.js";
import { SimCdkBucketDeployCopier } from "./sim-cdk-bucket-deploy-copier.js";

describe("SimCdkBucketDeployCopier", () => {
  const resource = new SimCfnResource({ logicalId: "DeploySite" });

  function properties(
    values: SimCfnTemplateValueRecord = {},
  ): SimCdkBucketDeployProperties {
    return new SimCdkBucketDeployProperties(resource, {
      DestinationBucketName: "site-bucket",
      SourceObjectKeys: ["abc123.zip"],
      ...values,
    });
  }

  /**
   * A staged asset directory holding the files a deployment would copy.
   */
  async function sourceDirectory(
    files: Record<string, string>,
  ): Promise<string> {
    const temporaryDirectory = new TemporaryDirectory();

    await Promise.all(
      Object.entries(files).map(async ([relativePath, content]) => {
        await temporaryDirectory.writeFile(relativePath.split("/"), content);
      }),
    );

    return await temporaryDirectory.resolvePath();
  }

  async function objectKeys(bucket: SimS3Bucket): Promise<string[]> {
    const objects = await bucket.listObjects();

    return objects
      .map((object) => object.key)
      .toSorted((a, b) => a.localeCompare(b));
  }

  it("copies the source files in as Objects", async () => {
    // Given a staged asset directory with a nested file.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const sourcePath = await sourceDirectory({
      "index.html": "<h1>Hello</h1>",
      "data/standard.keys": "keys",
    });

    // When the deployment is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties(),
    }).copy([sourcePath]);

    // Then each file is an Object under its path relative to the asset root.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "data/standard.keys,index.html");

    const object = await bucket.getObject("index.html");

    assertNonNullable(object);
    assertIdentical(object.body.toString("utf8"), "<h1>Hello</h1>");
  });

  it("copies several sources into one Bucket", async () => {
    // Given two staged asset directories.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const firstPath = await sourceDirectory({ "index.html": "one" });
    const secondPath = await sourceDirectory({ "about.html": "two" });

    // When a deployment with both sources is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({
        SourceObjectKeys: ["abc123.zip", "def456.zip"],
      }),
    }).copy([firstPath, secondPath]);

    // Then the Bucket holds both, rather than only the last one.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "about.html,index.html");
  });

  it("copies files under the destination key prefix", async () => {
    // Given a deployment into a key prefix.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const sourcePath = await sourceDirectory({ "app.css": "body{}" });

    // When it is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({ DestinationBucketKeyPrefix: "assets" }),
    }).copy([sourcePath]);

    // Then the Objects sit under the prefix.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "assets/app.css");
  });

  it("copies only the files the filters select", async () => {
    // Given a deployment saying "only the text files".
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const sourcePath = await sourceDirectory({
      "notes.txt": "text",
      "index.html": "markup",
    });

    // When it is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({ Exclude: ["*"], Include: ["*.txt"] }),
    }).copy([sourcePath]);

    // Then the file no include pattern rescued is left behind.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "notes.txt");
  });

  it("stores the deployment's system metadata over the guessed content type", async () => {
    // Given a deployment setting content headers on everything it copies.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const sourcePath = await sourceDirectory({ "standard.keys": "keys" });

    // When it is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({
        SystemMetadata: {
          "content-type": "text/plain",
          "content-encoding": "br",
          "cache-control": "public, max-age=60",
        },
      }),
    }).copy([sourcePath]);

    // Then the Object carries what the construct was told to set, in place of
    // the type the file extension would have suggested.
    const object = await bucket.getObject("standard.keys");

    assertNonNullable(object);
    assertIdentical(object.metadata.values["content-type"], "text/plain");
    assertIdentical(object.metadata.values["content-encoding"], "br");
    assertIdentical(
      object.metadata.values["cache-control"],
      "public, max-age=60",
    );
  });

  it("guesses a content type from the file extension without system metadata", async () => {
    // Given a deployment that sets no headers of its own.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const sourcePath = await sourceDirectory({ "index.html": "<h1>Hi</h1>" });

    // When it is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties(),
    }).copy([sourcePath]);

    // Then the type comes from the extension, as the CLI guesses one.
    const object = await bucket.getObject("index.html");

    assertNonNullable(object);
    assertIdentical(object.metadata.values["content-type"], "text/html");
  });

  it("prunes the Objects its source no longer holds", async () => {
    // Given a Bucket holding an Object from an earlier deployment.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });

    await bucket.putObject(
      new SimS3Object({
        key: "gone.html",
        body: Buffer.from("old"),
        metadata: new SimS3ObjectMetadata(),
      }),
    );

    const sourcePath = await sourceDirectory({ "index.html": "new" });

    // When a pruning deployment is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties(),
    }).copy([sourcePath]);

    // Then what the source no longer holds is removed.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "index.html");
  });

  it("leaves everything alone when pruning is turned off", async () => {
    // Given a Bucket another deployment has already written to.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });

    await bucket.putObject(
      new SimS3Object({
        key: "other.html",
        body: Buffer.from("other"),
        metadata: new SimS3ObjectMetadata(),
      }),
    );

    const sourcePath = await sourceDirectory({ "index.html": "new" });

    // When a second deployment into the same Bucket is copied in with pruning
    // turned off, which is what lets two of them share a Bucket.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({ Prune: false }),
    }).copy([sourcePath]);

    // Then both deployments' Objects are there.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "index.html,other.html");
  });

  it("prunes only inside its own destination prefix", async () => {
    // Given a Bucket holding an Object outside this deployment's prefix.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });

    await bucket.putObject(
      new SimS3Object({
        key: "index.html",
        body: Buffer.from("root"),
        metadata: new SimS3ObjectMetadata(),
      }),
    );

    const sourcePath = await sourceDirectory({ "app.css": "body{}" });

    // When a pruning deployment into a prefix is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({ DestinationBucketKeyPrefix: "assets" }),
    }).copy([sourcePath]);

    // Then the Object outside the prefix survives, because a sync only deletes
    // what it would have copied.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "assets/app.css,index.html");
  });

  it("prunes only what its filters would have copied", async () => {
    // Given a Bucket holding an Object a second deployment put in a directory
    // this one excludes.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });

    await bucket.putObject(
      new SimS3Object({
        key: "data/standard.keys",
        body: Buffer.from("keys"),
        metadata: new SimS3ObjectMetadata(),
      }),
    );

    const sourcePath = await sourceDirectory({ "index.html": "markup" });

    // When a pruning deployment excluding that directory is copied in.
    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties({ Exclude: ["data/*"] }),
    }).copy([sourcePath]);

    // Then the excluded Object is left alone, on the destination side as well
    // as the source side.
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "data/standard.keys,index.html");
  });

  it("removes an Object a later deployment of the same source drops", async () => {
    // Given a Bucket a deployment has already filled.
    const bucket = new SimS3Bucket({ bucketName: "site-bucket" });
    const firstPath = await sourceDirectory({
      "index.html": "one",
      "old.html": "two",
    });

    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties(),
    }).copy([firstPath]);

    // When the same deployment runs again from a source missing one file.
    const secondPath = await sourceDirectory({ "index.html": "one" });

    await new SimCdkBucketDeployCopier({
      bucket,
      properties: properties(),
    }).copy([secondPath]);

    // Then the dropped file is gone from the Bucket.
    assertUndefined(await bucket.getObject("old.html"));
    const keys = await objectKeys(bucket);

    assertIdentical(keys.join(","), "index.html");
  });
});
