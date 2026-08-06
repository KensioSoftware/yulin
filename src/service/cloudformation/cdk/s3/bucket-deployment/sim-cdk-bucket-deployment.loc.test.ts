import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimAwsLocalServer } from "../../../../../serve/index.js";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../../util/filesystem/temporary-directory.js";
import path from "node:path";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { TestCdkProject } from "../../../../../util/filesystem/test-cdk-project.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and asset manifest to pass to sim CloudFormation.
 */
describe("Sim CDK BucketDeployment local integration", () => {
  const simAws = new SimAws();

  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("sets up sim S3 bucket deployment on local filesystem", async () => {
    // Given static website content in a local filesystem directory.
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile("public/index.html", "<h1>Root</h1>");
    await projectDirectory.writeFile("public/foo/index.html", "<h1>Foo</h1>");

    // And a CDK stack with a BucketDeployment resource.
    const publicDirectory = projectDirectory.join("public");
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});
const bucket = new s3.Bucket(stack, "SiteBucket", {
  bucketName: "foo-bucket",
  websiteIndexDocument: "index.html",
  // A website Bucket must be publicly readable, which needs the Block Public
  // Access opt-out. CDK synthesizes an AWS::S3::BucketPolicy for this.
  publicReadAccess: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
});
new s3deploy.BucketDeployment(stack, "DeploySite", {
  sources: [s3deploy.Source.asset(${JSON.stringify(publicDirectory)})],
  destinationBucket: bucket,
  prune: true,
});
new cdk.CfnOutput(stack, "SiteBucketWebsiteUrl", {
  value: bucket.bucketWebsiteUrl,
});
app.synth();
`,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const simCfn = simAws.cloudFormation();
    const stack = await simCfn.deployTemplateFile(
      path.join(cdkOutDirectory, "TestStack.template.json"),
    );

    const websiteUrlOut = stack.outputs.get("SiteBucketWebsiteUrl")?.value;
    assertIdentical(
      websiteUrlOut,
      "http://foo-bucket.s3-website.us-east-1.sim-aws.localhost/",
    );
    const websiteRoot = srv.localUrl(websiteUrlOut).toString().trimEnd();

    // Then we should be able to fetch the objects from the local sim server.
    const rootResponse = await fetch(websiteRoot);
    assertIdentical(rootResponse.status, 200);
    assertStringIncludes(rootResponse.headers.get("content-type"), "text/html");
    assertStringIncludes(await rootResponse.text(), "<h1>Root</h1>");

    const fooResponse = await fetch(`${websiteRoot}foo/`);
    assertIdentical(fooResponse.status, 200);
    assertStringIncludes(fooResponse.headers.get("content-type"), "text/html");
    assertStringIncludes(await fooResponse.text(), "<h1>Foo</h1>");
  });
});
