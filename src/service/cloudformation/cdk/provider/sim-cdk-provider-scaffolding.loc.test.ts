import { assertArrayEquals, assertNonNullable } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and asset manifest to pass to sim CloudFormation.
 *
 * The point of synthesizing rather than writing the template out is that CDK
 * decides the shape of the scaffolding, and keeps changing it: the provider's
 * log group only appears in the template at all under a feature flag added
 * long after `BucketDeployment` itself. A test that recognises the scaffolding
 * in a template of its own authorship would keep passing after CDK moved.
 */
describe("Sim CDK custom Resource provider scaffolding local integration", () => {
  it("reports no gaps for a stack whose deployments it carried out", async () => {
    // Given static website content in a local filesystem directory.
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile("public/index.html", "<h1>Root</h1>");
    await projectDirectory.writeFile("public/fonts/body.woff2", "font");

    // And a CDK stack with two BucketDeployment constructs into one Bucket,
    // which is two AWS CLI Layers around one shared provider function, with the
    // feature flag that writes that function's log group into the template.
    const publicDirectory = projectDirectory.join("public");
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
const app = new cdk.App({
  context: { "@aws-cdk/aws-lambda:useCdkManagedLogGroup": true },
});
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});
const bucket = new s3.Bucket(stack, "SiteBucket", {
  bucketName: "scaffolding-bucket",
});
new s3deploy.BucketDeployment(stack, "DeploySite", {
  sources: [s3deploy.Source.asset(${JSON.stringify(publicDirectory)})],
  destinationBucket: bucket,
  exclude: ["fonts/*"],
});
new s3deploy.BucketDeployment(stack, "DeployFonts", {
  sources: [s3deploy.Source.asset(${JSON.stringify(publicDirectory)})],
  destinationBucket: bucket,
  exclude: ["*"],
  include: ["fonts/*"],
  prune: false,
});
app.synth();
`,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );

    // Then both deployments copied their files, so the stack did everything the
    // template asked for.
    const bucket = simAws.s3().getSimBucketByName("scaffolding-bucket");
    assertNonNullable(bucket);
    assertNonNullable(await bucket.getObject("index.html"));
    assertNonNullable(await bucket.getObject("fonts/body.woff2"));

    // And nothing is reported as a gap. The provider CDK synthesized to do that
    // copying is reported as deliberately left out instead, along with the AWS
    // CLI Layer each construct brings and the provider's log group.
    assertArrayEquals(resourceTypesOf(stack.skippedResources), []);
    assertArrayEquals(resourceTypesOf(stack.inertResources), [
      "AWS::CDK::Metadata",
      "AWS::Lambda::Function",
      "AWS::Lambda::LayerVersion",
      "AWS::Lambda::LayerVersion",
      "AWS::Logs::LogGroup",
    ]);
  });
});

function resourceTypesOf(resources: readonly SimCfnResource[]): string[] {
  return resources
    .map((resource) => resource.type ?? "")
    .toSorted((left, right) => left.localeCompare(right));
}
