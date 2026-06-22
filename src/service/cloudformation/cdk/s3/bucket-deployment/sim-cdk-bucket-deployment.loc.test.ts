import { afterAll, beforeAll, describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimAwsLocalServer } from "../../../../../serve/index.js";
import { TempDir } from "../../../../../util/filesystem/temp-dir.js";
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

  afterAll(() => {
    srv.close();
  });

  it("sets up sim S3 bucket deployment on local filesystem", async () => {
    // Given static website content in a local filesystem directory.
    const projectDir = new TempDir();
    await projectDir.writeFile("public/index.html", "<h1>Root</h1>");
    await projectDir.writeFile("public/foo/index.html", "<h1>Foo</h1>");

    // And a CDK stack with a BucketDeployment resource.
    const publicDir = projectDir.join("public");
    const cdkProject = new TestCdkProject({ projectDir });
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
});
new s3deploy.BucketDeployment(stack, "DeploySite", {
  sources: [s3deploy.Source.asset(${JSON.stringify(publicDir)})],
  destinationBucket: bucket,
  prune: true,
});
app.synth();
`,
    );

    // And we synth the CDK template.
    const cdkOutDir = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const simCfn = simAws.cloudFormation();
    await simCfn.deployTemplateFile(
      path.join(cdkOutDir, "TestStack.template.json"),
    );

    // Then we should be able to fetch the objects from the local sim server.
    const rootRes = await fetch(
      `http://foo-bucket.s3-website.us-east-1.sim-aws.localhost:${srv.port}/`,
    );
    assertIdentical(rootRes.status, 200);
    assertStringIncludes(rootRes.headers.get("content-type"), "text/html");
    assertStringIncludes(await rootRes.text(), "<h1>Root</h1>");

    const fooRes = await fetch(
      `http://foo-bucket.s3-website.us-east-1.sim-aws.localhost:${srv.port}/foo/`,
    );
    assertIdentical(fooRes.status, 200);
    assertStringIncludes(fooRes.headers.get("content-type"), "text/html");
    assertStringIncludes(await fooRes.text(), "<h1>Foo</h1>");
  });
});
