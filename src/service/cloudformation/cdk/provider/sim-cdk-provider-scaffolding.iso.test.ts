import { assertArrayEquals, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnDeployedResource } from "../../resource/sim-cfn-deployed-resource.type.js";
import type { SimCfnDeployedStack } from "../../stack/sim-cfn-deployed-stack.type.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { simCdkProviderScaffoldingTemplateFactory } from "./sim-cdk-provider-scaffolding-template.factory.js";

const templatePathParts = ["cdk.out", "SiteStack.template.json"];
const assetsPathParts = ["cdk.out", "SiteStack.assets.json"];

const pythonFunctionProperties = {
  Code: {
    S3Bucket: "cdk-hnb659fds-assets-111111111111-eu-west-2",
    S3Key: "t.zip",
  },
  Handler: "index.handler",
  Role: { "Fn::GetAtt": ["ThumbnailerRole", "Arn"] },
  Runtime: "python3.13",
};

describe("CDK custom Resource provider scaffolding [iso]", () => {
  it("reports the provider Resources as inert rather than skipped", async () => {
    // Given two CDK BucketDeployments into one Bucket, with the AWS CLI Layer
    // each of them synthesizes, the Python provider function they share, and
    // that function's log group.
    const stack = await deployScaffoldedStack();

    // Then nothing is reported as a gap, because nothing is missing: sim
    // CloudFormation did the deployments itself.
    assertArrayEquals(logicalIdsOf(stack.skippedResources), []);

    // And the Resources it stood in for are reported as deliberately left out.
    // The provider's log group is not among them: simulated CloudWatch Logs
    // creates it like any other, and an empty log group is what an account is
    // left with when nothing invokes the function either.
    assertArrayEquals(logicalIdsOf(stack.inertResources), [
      "BucketDeploymentProvider",
      "Deploy0AwsCliLayer",
      "Deploy1AwsCliLayer",
    ]);
  });

  it("says why each provider Resource was left out", async () => {
    // Given the same Stack.
    const stack = await deployScaffoldedStack();

    // Then the provider function names the custom Resource this simulator
    // carried out in its place, rather than telling the reader to bind a
    // handler to a function nothing will ever invoke.
    assertStringIncludes(
      stack.getResource("BucketDeploymentProvider")?.inertReason,
      "sim CloudFormation carries out Custom::CDKBucketDeployment itself",
    );

    // And a Layer says what it would take for one to start mattering, since it
    // is recognised on being a Layer rather than on backing this provider.
    assertStringIncludes(
      stack.getResource("Deploy1AwsCliLayer")?.inertReason,
      "simulated function's module path",
    );
  });

  it("still reports a function of the reader's own as skipped", async () => {
    // Given the same Stack with a Python function of the app's own beside the
    // scaffolding, and a log group for it.
    const stack = await deployScaffoldedStack({
      ThumbnailerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "thumbnailer-role",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      Thumbnailer: {
        Type: "AWS::Lambda::Function",
        Properties: pythonFunctionProperties,
      },
      ThumbnailerLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: {
            "Fn::Join": ["", ["/aws/lambda/", { Ref: "Thumbnailer" }]],
          },
        },
      },
    });

    // Then the Python function is still a gap, because a test written against
    // it would find it missing. Its log group is not: that one deploys for
    // real now, so a test can assert on the retention it was given even though
    // nothing will ever write to it.
    assertArrayEquals(logicalIdsOf(stack.skippedResources), ["Thumbnailer"]);
  });

  it("carries on past a hand-written deployment that names no provider", async () => {
    // Given a third deployment written into the template directly rather than
    // synthesized, so it has no ServiceToken and no provider behind it at all,
    // beside a Resource nothing simulates.
    const stack = await deployScaffoldedStack({
      HandWrittenDeployment: {
        Type: "Custom::CDKBucketDeployment",
        Properties: {
          DestinationBucketName: { Ref: "SiteBucket" },
          DestinationBucketKeyPrefix: "copy/",
          SourceObjectKeys: ["site.zip"],
          Prune: false,
        },
      },
      WebServer: { Type: "AWS::EC2::Instance" },
    });

    // Then it deploys like any other, and the scaffolding around the two that
    // do name a provider is still recognised.
    assertArrayEquals(logicalIdsOf(stack.skippedResources), ["WebServer"]);
    assertArrayEquals(logicalIdsOf(stack.inertResources), [
      "BucketDeploymentProvider",
      "Deploy0AwsCliLayer",
      "Deploy1AwsCliLayer",
    ]);
  });
});

/**
 * Deploy a cloud assembly holding two BucketDeployments and their provider.
 *
 * Deployed from a template file rather than a template object, because a
 * BucketDeployment copies from a staged asset directory the assets manifest
 * names, and there is no manifest without one.
 */
async function deployScaffoldedStack(
  resources: CfnTemplateBodyRecord["Resources"] = {},
): Promise<SimCfnDeployedStack> {
  const temporaryDirectory = new TemporaryDirectory();
  const siteAsset = "asset.aaaa1111";
  const fontsAsset = "asset.bbbb2222";

  await temporaryDirectory.writeFile(
    ["cdk.out", siteAsset, "index.html"],
    "<h1>Hello</h1>",
  );
  await temporaryDirectory.writeFile(
    ["cdk.out", fontsAsset, "fonts", "body.woff2"],
    "font",
  );

  await temporaryDirectory.writeFile(
    templatePathParts,
    jsonStringify(
      simCdkProviderScaffoldingTemplateFactory.make({
        sourceObjectKeys: ["site.zip", "fonts.zip"],
        resources,
      }),
    ),
  );

  await temporaryDirectory.writeFile(
    assetsPathParts,
    jsonStringify({
      files: {
        site: {
          source: { path: siteAsset, packaging: "zip" },
          destinations: {
            "current_account-current_region": { objectKey: "site.zip" },
          },
        },
        fonts: {
          source: { path: fontsAsset, packaging: "zip" },
          destinations: {
            "current_account-current_region": { objectKey: "fonts.zip" },
          },
        },
      },
    }),
  );

  return await new SimAws()
    .cloudFormation()
    .deployTemplateFile(temporaryDirectory.join(...templatePathParts));
}

function logicalIdsOf(resources: readonly SimCfnDeployedResource[]): string[] {
  return resources
    .map((resource) => resource.logicalId)
    .toSorted((left, right) => left.localeCompare(right));
}
