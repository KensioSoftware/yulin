import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";
import { TemporaryDirectory } from "../../../../../util/filesystem/temporary-directory.js";

/**
 * Two CDK BucketDeployments into one Bucket, which is the usual arrangement
 * whenever the content headers differ by file type: a `BucketDeployment` sets
 * them for all of its files at once, so a second deployment is how the rest of
 * the site gets different ones.
 */
describe("CDK BucketDeployments sharing a destination Bucket [iso]", () => {
  it("keeps both deployments' Objects, each with its own headers", async () => {
    // Given a synthesized cloud assembly with two BucketDeployment assets into
    // the same Bucket, the second of which does not prune.
    const temporaryDirectory = new TemporaryDirectory();
    const siteAsset = "asset.aaaa1111";
    const dataAsset = "asset.bbbb2222";
    const templatePathParts = ["cdk.out", "FooStack.template.json"];

    await temporaryDirectory.writeFile(
      ["cdk.out", siteAsset, "index.html"],
      "<h1>Hello</h1>",
    );
    await temporaryDirectory.writeFile(
      ["cdk.out", dataAsset, "data", "standard.keys"],
      "compressed",
    );

    await temporaryDirectory.writeFile(
      templatePathParts,
      jsonStringify({
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "site-bucket" },
          },
          DeploySite: {
            Type: "Custom::CDKBucketDeployment",
            Properties: {
              DestinationBucketName: { Ref: "SiteBucket" },
              SourceObjectKeys: ["site.zip"],
              Exclude: ["data/*"],
              SystemMetadata: { "cache-control": "public, max-age=0" },
            },
          },
          DeployData: {
            Type: "Custom::CDKBucketDeployment",
            Properties: {
              DestinationBucketName: { Ref: "SiteBucket" },
              SourceObjectKeys: ["data.zip"],
              Prune: false,
              SystemMetadata: {
                "cache-control": "public, max-age=31536000, immutable",
                "content-encoding": "br",
              },
            },
          },
        },
      }),
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
          data: {
            source: { path: dataAsset, packaging: "zip" },
            destinations: {
              "current_account-current_region": { objectKey: "data.zip" },
            },
          },
        },
      }),
    );

    // When the template is deployed.
    const simAws = new SimAws();

    await simAws
      .cloudFormation()
      .deployTemplateFile(temporaryDirectory.join(...templatePathParts));

    // Then the Bucket holds the files from both deployments, rather than only
    // the last one to run.
    const bucket = simAws.s3().getSimBucketByName("site-bucket");

    assertNonNullable(bucket);

    const page = await bucket.getObject("index.html");
    const data = await bucket.getObject("data/standard.keys");

    assertNonNullable(page);
    assertNonNullable(data);

    // And each carries the headers its own deployment set.
    assertIdentical(page.metadata.values["cache-control"], "public, max-age=0");
    assertIdentical(
      data.metadata.values["cache-control"],
      "public, max-age=31536000, immutable",
    );
    assertIdentical(data.metadata.values["content-encoding"], "br");
  });
});
