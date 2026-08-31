import path from "node:path";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontFunction } from "../../../cloudfront/cff/sim-cloudfront-function.js";
import { SimCloudFrontDistribution } from "../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized CloudFront Function and
 * Distribution through sim CloudFormation using the handler source code
 * embedded in the template.
 */
describe("Sim CDK CloudFront Function embedded source local integration", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("deploys a CloudFront Function association using embedded source code", async () => {
    // Given a real js2 syntax CloudFront Function handler file in the temp CDK
    // project.
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile(
      "cff/rewrite-function.js",
      `
function handler(event) {
  if (event.request.uri === "/redirect-me.html") {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: { value: "https://example.test/from-embedded-source.html" },
      },
    };
  }

  return event.request;
}
`,
    );

    const handlerFile = projectDirectory.join("cff/rewrite-function.js");

    // And a CDK stack with an S3 Bucket, CloudFront Function, and Distribution
    // associated with that Function.
    const cdkProject = new TestCdkProject({ projectDirectory });

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

new s3.CfnBucket(stack, "SiteBucket", {
  bucketName: "cdk-cff-source-site-bucket",
});

const rewriteFunction = new cloudfront.CfnFunction(stack, "RewriteFunction", {
  name: "cdk-source-rewrite-function",
  autoPublish: true,
  functionConfig: {
    comment: "Rewrite function",
    runtime: "cloudfront-js-2.0",
  },
  functionCode: cloudfront.FunctionCode.fromFile({
    filePath: ${JSON.stringify(handlerFile)},
  }).render(),
});

new cloudfront.CfnDistribution(stack, "SiteDistribution", {
  distributionConfig: {
    enabled: true,
    origins: [
      {
        id: "SiteOrigin",
        domainName: "cdk-cff-source-site-bucket.s3.amazonaws.com",
        s3OriginConfig: {},
      },
    ],
    defaultCacheBehavior: {
      targetOriginId: "SiteOrigin",
      viewerProtocolPolicy: "allow-all",
      functionAssociations: [
        {
          eventType: "viewer-request",
          functionArn: rewriteFunction.attrFunctionArn,
        },
      ],
    },
  },
});

app.synth();
`);

    // And the CDK app is synthesized to a CloudFormation template.
    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed through sim CloudFormation without
    // any executable binding.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );

    // Then sim CloudFormation creates both the Function and Distribution.
    const functionResource = stack.getResource("RewriteFunction");
    const distroResource = stack.getResource("SiteDistribution");

    assertNonNullable(functionResource);
    assertNonNullable(distroResource);
    assertInstanceOf(functionResource.simResource, SimCloudFrontFunction);
    assertInstanceOf(distroResource.simResource, SimCloudFrontDistribution);

    const distro = distroResource.simResource;
    assertIdentical(
      distro.behaviors[0]?.functionAssociations?.viewerRequest,
      functionResource.simResource.arn,
    );

    // And requests through the Distribution execute the handler source embedded
    // in the synthesized template.
    const distroSubdomain = distro.distributionId.toLowerCase();
    const response = await fetch(
      `http://${distroSubdomain}.cloudfront.net.sim-aws.localhost:${srv.port}/redirect-me.html`,
      { redirect: "manual" },
    );

    assertResponseStatus(response, 302, await describeResponse(response));
    assertIdentical(
      response.headers.get("location"),
      "https://example.test/from-embedded-source.html",
    );
  });
});
