import { readdir, readFile } from "node:fs/promises";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  jsonParse,
  jsonStringify,
  type JSONString,
} from "../../../util/type-guard/json.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";

const assetDirectoryName =
  "asset.31e8a41d3ff70be515d436d1393b5d444831b547d127baaaec63c5abe713679f";

describe("Deploying a CDK template from memory [iso]", () => {
  it("resolves CDK assets for a template edited in memory from the cloud assembly it names", async () => {
    // Given a synthesized CDK cloud assembly with a BucketDeployment asset.
    const temporaryDirectory = await makeCloudAssembly();
    const templatePath = temporaryDirectory.join(
      "cdk.out",
      "FooStack.template.json",
    );

    // And that template read and edited in memory rather than deployed as a file.
    const template = await readTemplate(templatePath);
    const edited = withoutBucketVersioning(template);

    // When the edited template is deployed, naming the file it came from.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "site-stack",
      template: edited,
      templatePath,
    });

    // Then the BucketDeployment resolves its staged asset through the sibling
    // assets manifest, as it would when deployed from the file.
    const bucket = simAws.s3().getSimBucketByName("site-bucket");

    assertNonNullable(bucket);

    const object = await bucket.getObject("index.html");

    assertNonNullable(object);
    assertIdentical(object.body.toString("utf8"), "<h1>Hello</h1>");
    assertIdentical(stack.stackName, "site-stack");

    // And nothing was written back into the cloud assembly to make that work.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const cloudAssemblyFileNames = await readdir(
      temporaryDirectory.join("cdk.out"),
    );

    assertArrayEquals(cloudAssemblyFileNames.toSorted(compareStrings), [
      assetDirectoryName,
      "FooStack.assets.json",
      "FooStack.template.json",
    ]);
  });

  it("fails with the CDK assets manifest diagnostic when a template deployed from memory names no cloud assembly", async () => {
    // Given a template with a BucketDeployment asset reference, held in memory
    // with no CDK cloud assembly named for it.
    const temporaryDirectory = await makeCloudAssembly();
    const template = await readTemplate(
      temporaryDirectory.join("cdk.out", "FooStack.template.json"),
    );

    // When it is deployed, then deployment fails on the resource that needed
    // the assets manifest.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "site-stack",
        template: withoutBucketVersioning(template),
      }),
    );

    assertStringIncludes(
      error.message,
      "Could not configure Custom::CDKBucketDeployment DeploySite.",
    );
    assertStringIncludes(error.message, "No CDK assets manifest is available.");
  });

  it("fails with the expected assets manifest path when the named template file has no sibling manifest", async () => {
    // Given a template deployed from memory that names a template file with no
    // sibling CDK assets manifest.
    const temporaryDirectory = await makeCloudAssembly({
      assetsManifest: false,
    });
    const templatePath = temporaryDirectory.join(
      "cdk.out",
      "FooStack.template.json",
    );
    const template = await readTemplate(templatePath);

    // When it is deployed, then the failure points at the manifest file that
    // was expected next to it, as deploying the file itself does.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "site-stack",
        template: withoutBucketVersioning(template),
        templatePath,
      }),
    );

    assertStringIncludes(
      error.message,
      "Could not configure Custom::CDKBucketDeployment DeploySite.",
    );
    assertStringIncludes(
      error.message,
      temporaryDirectory.join("cdk.out", "FooStack.assets.json"),
    );
    assertStringIncludes(
      error.message,
      "No matching CDK file asset with a source path was found.",
    );
  });
});

/**
 * Write a synthesized CDK cloud assembly holding a site Bucket, a
 * BucketDeployment of a staged asset, and a Bucket property this simulator
 * refuses, so the template has to be edited before it can be deployed.
 */
async function makeCloudAssembly(
  properties: { readonly assetsManifest?: boolean } = {},
): Promise<TemporaryDirectory> {
  const temporaryDirectory = new TemporaryDirectory();

  await temporaryDirectory.writeFile(
    ["cdk.out", assetDirectoryName, "index.html"],
    "<h1>Hello</h1>",
  );

  await temporaryDirectory.writeFile(
    ["cdk.out", "FooStack.template.json"],
    jsonStringify({
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "site-bucket",
            VersioningConfiguration: { Status: "Enabled" },
          },
        },
        DeploySite: {
          Type: "Custom::CDKBucketDeployment",
          Properties: {
            DestinationBucketName: { Ref: "SiteBucket" },
            SourceObjectKeys: ["abc123.zip"],
          },
        },
      },
    }),
  );

  if (properties.assetsManifest !== false) {
    await temporaryDirectory.writeFile(
      ["cdk.out", "FooStack.assets.json"],
      jsonStringify({
        files: {
          abc123: {
            source: { path: assetDirectoryName, packaging: "zip" },
            destinations: {
              "current_account-current_region": { objectKey: "abc123.zip" },
            },
          },
        },
      }),
    );
  }

  return temporaryDirectory;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

async function readTemplate(
  templatePath: string,
): Promise<CfnTemplateBodyRecord> {
  return jsonParse(
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    (await readFile(templatePath, "utf8")) as JSONString<CfnTemplateBodyRecord>,
  );
}

/**
 * Stand in for whatever transformation a test author applies to a synthesized
 * template before deploying it, here dropping a Bucket property this simulator
 * does not accept.
 */
function withoutBucketVersioning(
  template: CfnTemplateBodyRecord,
): CfnTemplateBodyRecord {
  return {
    ...template,
    Resources: {
      ...template.Resources,
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
    },
  };
}
