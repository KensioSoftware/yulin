import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { makeTempDir } from "../../../../util/filesystem/temp-dir.js";
import { SimCdkBucketDeploymentResourceFactory } from "./sim-cdk-bucket-deployment.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../resource/sim-cfn-resource.js";

/* eslint-disable security/detect-non-literal-fs-filename */

/**
 * Faster "isolated" test that assumes structure of /cdk.out/ manifest and
 * assets, without using real CDK synth.
 */
describe("CDK BucketDeployment CloudFormation Custom Resource [iso]", () => {
  it("configures the destination S3 Bucket with filesystem storage from the CDK asset", async () => {
    // Given a synthesized CDK cloud assembly with a BucketDeployment asset.
    const testDirectoryPath = await makeTempDir();
    const cdkOutPath = path.join(testDirectoryPath, "cdk.out");
    const assetDirectoryName =
      "asset.31e8a41d3ff70be515d436d1393b5d444831b547d127baaaec63c5abe713679f";
    const assetPath = path.join(cdkOutPath, assetDirectoryName);

    await mkdir(assetPath, { recursive: true });
    await writeFile(path.join(assetPath, "index.html"), "<h1>Hello</h1>");

    const templatePath = path.join(cdkOutPath, "FooStack.template.json");
    const assetsPath = path.join(cdkOutPath, "FooStack.assets.json");

    await writeFile(
      templatePath,
      jsonStringify({
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "site-bucket",
            },
          },
          DeploySite: {
            Type: "Custom::CDKBucketDeployment",
            Properties: {
              DestinationBucketName: {
                Ref: "SiteBucket",
              },
              SourceObjectKeys: ["abc123.zip"],
            },
          },
        },
      }),
    );

    await writeFile(
      assetsPath,
      jsonStringify({
        files: {
          abc123: {
            source: {
              path: assetDirectoryName,
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "abc123.zip",
              },
            },
          },
        },
      }),
    );

    // When the synthesized template file is deployed through sim CFN.
    const simAws = new SimAws();

    await simAws.cloudFormation().deployTemplateFile(templatePath);

    // Then the BucketDeployment configures the destination Bucket with
    // filesystem storage rooted at the staged CDK asset.
    const bucket = simAws.s3().getSimBucketByName("site-bucket");

    assertNonNullable(bucket);

    const object = await bucket.getObject("index.html");

    assertNonNullable(object);
    assertIdentical(object.body.toString("utf8"), "<h1>Hello</h1>");
  });

  it("rejects unsupported Custom CDK BucketDeployment Resource type names", async () => {
    // Given the CDK BucketDeployment Resource factory.
    const factory = new SimCdkBucketDeploymentResourceFactory();

    // When creation is attempted with an unexpected Resource type name, then it
    // rejects with an unsupported Resource type error.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create(
        "SomethingElse",
        {} as SimCfnResource,
        {} as SimCloudFormationResourceCreateContext,
      ),
    );

    // And the unsupported Resource type name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CDK BucketDeployment Resource SomethingElse",
    );
  });

  it("fails deployment when the CDK BucketDeployment destination Bucket does not exist", async () => {
    // Given a synthesized CDK cloud assembly with a BucketDeployment that
    // targets a missing destination Bucket.
    const testDirectoryPath = await makeTempDir();
    const cdkOutPath = path.join(testDirectoryPath, "cdk.out");
    const assetDirectoryName =
      "asset.31e8a41d3ff70be515d436d1393b5d444831b547d127baaaec63c5abe713679f";
    const assetPath = path.join(cdkOutPath, assetDirectoryName);

    await mkdir(assetPath, { recursive: true });
    await writeFile(path.join(assetPath, "index.html"), "<h1>Hello</h1>");

    const templatePath = path.join(cdkOutPath, "FooStack.template.json");
    const assetsPath = path.join(cdkOutPath, "FooStack.assets.json");

    await writeFile(
      templatePath,
      jsonStringify({
        Resources: {
          DeploySite: {
            Type: "Custom::CDKBucketDeployment",
            Properties: {
              DestinationBucketName: "missing-site-bucket",
              SourceObjectKeys: ["abc123.zip"],
            },
          },
        },
      }),
    );

    await writeFile(
      assetsPath,
      jsonStringify({
        files: {
          abc123: {
            source: {
              path: assetDirectoryName,
              packaging: "zip",
            },
            destinations: {
              "current_account-current_region": {
                objectKey: "abc123.zip",
              },
            },
          },
        },
      }),
    );

    // When the synthesized template file is deployed through top-level SimAws,
    // then the deployment rejects with the missing destination Bucket error.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplateFile(templatePath),
    );

    assertStringIncludes(
      error.message,
      "Custom::CDKBucketDeployment destination Bucket missing-site-bucket does not exist",
    );
  });
});
