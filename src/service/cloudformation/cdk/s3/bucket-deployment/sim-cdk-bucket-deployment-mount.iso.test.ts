import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";
import { TemporaryDirectory } from "../../../../../util/filesystem/temporary-directory.js";

/**
 * A Bucket a CDK BucketDeployment fills and a mounted directory then serves,
 * which is the local development arrangement a site is written for: the Stack
 * is deployed into simulated AWS, and the Bucket is pointed at the generator's
 * output so a rebuild reaches the open page.
 *
 * The mount replaces the storage, and the Objects the deployment put there go
 * with it. What the deployment said about them does not, so the files on disk
 * are served with the headers the Objects had, and a compressed mirror stays
 * bytes a browser can decode.
 */
describe("A directory mounted over a deployed Bucket [iso]", () => {
  const bucketName = "site-bucket";
  const siteAsset = "asset.aaaa1111";
  const mirrorAsset = "asset.bbbb2222";
  const templatePathParts = ["cdk.out", "FooStack.template.json"];

  /** The deployment that publishes the site itself. */
  const deploySite = {
    DeploySite: {
      Type: "Custom::CDKBucketDeployment",
      Properties: {
        DestinationBucketName: bucketName,
        SourceObjectKeys: ["site.zip"],
        SystemMetadata: { "cache-control": "public, max-age=0" },
      },
    },
  };

  /** The deployment that publishes the compressed mirror beside it. */
  const deployMirror = {
    DeployMirror: {
      Type: "Custom::CDKBucketDeployment",
      Properties: {
        DestinationBucketName: bucketName,
        SourceObjectKeys: ["mirror.zip"],
        DestinationBucketKeyPrefix: "br",
        Prune: false,
        SystemMetadata: {
          "content-encoding": "br",
          "cache-control": "public, max-age=31536000, immutable",
        },
      },
    },
  };

  /**
   * Write a cloud assembly holding a site and a brotli mirror of its scripts,
   * published by whichever deployments the test names.
   */
  async function writeAssembly(
    temporaryDirectory: TemporaryDirectory,
    resources: SimCfnTemplateValueRecord,
  ): Promise<string> {
    await temporaryDirectory.writeFile(
      ["cdk.out", siteAsset, "index.html"],
      "<h1>Hello</h1>",
    );
    await temporaryDirectory.writeFile(
      ["cdk.out", mirrorAsset, "js", "app.js"],
      "compressed",
    );

    await temporaryDirectory.writeFile(
      templatePathParts,
      jsonStringify({ Resources: resources }),
    );

    await temporaryDirectory.writeFile(
      ["cdk.out", "FooStack.assets.json"],
      jsonStringify({
        files: {
          site: {
            source: { path: siteAsset, packaging: "zip" },
            destinations: {
              "current_account-current_region": { objectKey: "site.zip" },
            },
          },
          mirror: {
            source: { path: mirrorAsset, packaging: "zip" },
            destinations: {
              "current_account-current_region": { objectKey: "mirror.zip" },
            },
          },
        },
      }),
    );

    return temporaryDirectory.join(...templatePathParts);
  }

  /** The directory the site generator writes, which the Bucket is pointed at. */
  async function writeBuildOutput(
    temporaryDirectory: TemporaryDirectory,
  ): Promise<string> {
    await temporaryDirectory.writeFile(
      ["public", "index.html"],
      "<h1>Hello again</h1>",
    );
    await temporaryDirectory.writeFile(
      ["public", "br", "js", "app.js"],
      "compressed again",
    );
    await temporaryDirectory.writeFile(
      ["public", "br", "js", "new.js"],
      "compressed and new",
    );

    return temporaryDirectory.join("public");
  }

  /** The Bucket the site is published into, which a Stack of its own creates. */
  async function createBucket(simAws: SimAws): Promise<void> {
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  }

  it("serves the mounted files with the headers the deployments published", async () => {
    // Given a deployed site with a compressed mirror of its scripts.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = await writeAssembly(temporaryDirectory, {
      ...deploySite,
      ...deployMirror,
    });
    const simAws = new SimAws();

    await createBucket(simAws);
    await simAws.cloudFormation().deployTemplateFile(templatePath);

    // When the Bucket is pointed at the directory the generator rebuilds into.
    simAws
      .s3()
      .mountBucketFilesystem(
        bucketName,
        await writeBuildOutput(temporaryDirectory),
      );

    const bucket = simAws.s3().getSimBucketByName(bucketName);

    assertNonNullable(bucket);

    const page = await bucket.getObject("index.html");
    const mirrored = await bucket.getObject("br/js/app.js");

    assertNonNullable(page);
    assertNonNullable(mirrored);

    // Then each file is served as the Object it replaced was, without the mount
    // having restated any of it. The mirrored script is bytes a browser can
    // decode rather than bytes it hands back unread.
    assertIdentical(page.metadata.values["cache-control"], "public, max-age=0");
    assertIdentical(page.metadata.values["content-type"], "text/html");
    assertUndefined(page.metadata.values["content-encoding"]);

    assertIdentical(mirrored.metadata.values["content-encoding"], "br");
    assertIdentical(
      mirrored.metadata.values["cache-control"],
      "public, max-age=31536000, immutable",
    );
  });

  it("describes a file the build wrote after the deployment ran", async () => {
    // Given a Bucket only the mirror deployment publishes into, so the rule
    // behind its Objects is not one two deployments could both claim.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = await writeAssembly(temporaryDirectory, deployMirror);
    const simAws = new SimAws();

    await createBucket(simAws);
    await simAws.cloudFormation().deployTemplateFile(templatePath);

    simAws
      .s3()
      .mountBucketFilesystem(
        bucketName,
        await writeBuildOutput(temporaryDirectory),
      );

    // When a script the deployment never saw is read.
    const bucket = simAws.s3().getSimBucketByName(bucketName);

    assertNonNullable(bucket);

    const added = await bucket.getObject("br/js/new.js");

    // Then the deployment's own rule answers for it: a file under the mirror is
    // a mirrored file whenever it was written.
    assertNonNullable(added);
    assertIdentical(added.metadata.values["content-encoding"], "br");
  });

  it("inherits from a Stack deployed after the directory was mounted", async () => {
    // Given a Bucket pointed at the build output before anything describes it,
    // which is a dev script mounting on start-up and deploying afterwards.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = await writeAssembly(temporaryDirectory, deployMirror);
    const simAws = new SimAws();

    await createBucket(simAws);

    simAws
      .s3()
      .mountBucketFilesystem(
        bucketName,
        await writeBuildOutput(temporaryDirectory),
      );

    // When the Stack that describes the Bucket is deployed.
    await simAws.cloudFormation().deployTemplateFile(templatePath);

    const bucket = simAws.s3().getSimBucketByName(bucketName);

    assertNonNullable(bucket);

    const mirrored = await bucket.getObject("br/js/app.js");

    // Then the mount reports what the Bucket has been told, rather than what it
    // had to say for itself at the moment it was mounted.
    assertNonNullable(mirrored);
    assertIdentical(mirrored.metadata.values["content-encoding"], "br");
  });

  it("lets the mount answer differently from the deployment", async () => {
    // Given the same deployed site.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = await writeAssembly(temporaryDirectory, {
      ...deploySite,
      ...deployMirror,
    });
    const simAws = new SimAws();

    await createBucket(simAws);
    await simAws.cloudFormation().deployTemplateFile(templatePath);

    // When the mount declares a directive of its own for the mirror, because a
    // year of caching is not what a rebuild wants reaching the browser.
    simAws
      .s3()
      .mountBucketFilesystem(
        bucketName,
        await writeBuildOutput(temporaryDirectory),
        {
          systemMetadata: [
            { keyPrefix: "br/", metadata: { CacheControl: "no-store" } },
          ],
        },
      );

    const bucket = simAws.s3().getSimBucketByName(bucketName);

    assertNonNullable(bucket);

    const mirrored = await bucket.getObject("br/js/app.js");

    // Then the mount has the last word on the header it named, and the one it
    // said nothing about is still the deployment's.
    assertNonNullable(mirrored);
    assertIdentical(mirrored.metadata.values["cache-control"], "no-store");
    assertIdentical(mirrored.metadata.values["content-encoding"], "br");
  });
});
