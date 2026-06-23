import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontFunction } from "../../../cloudfront/cff/sim-cloudfront-function.js";
import { SimCloudFrontDistribution } from "../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import type { CloudFrontFunction } from "../../../cloudfront/index.js";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";
import { TempDir } from "../../../../util/filesystem/temp-dir.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized CloudFront Function and
 * Distribution through sim CloudFormation using a binding to swap in the real
 * handler function.
 */
describe("Sim CDK CloudFront Function binding local integration", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("deploys a CloudFront Function association using a binding", async () => {
    // Given a real js2 syntax CloudFront Function handler file in the temp CDK
    // project.
    const projectDir = new TempDir();
    await projectDir.writeFile(
      "cff/rewrite-function.js",
      // (We allow `export` in CFF JS2 files, and in real projects strip it out
      // at CDK compile time.)
      `
export function handler(event) {
  if (event.request.uri === "/redirect-me.html") {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: { value: "https://example.test/from-bound-handler.html" },
      },
    };
  }

  return event.request;
}
`,
    );

    const handlerFile = projectDir.join("cff/rewrite-function.js");

    // And a CDK stack with an S3 Bucket, CloudFront Function, and Distribution
    // associated with that Function.
    const cdkProject = new TestCdkProject({ projectDir });

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

new s3.CfnBucket(stack, "SiteBucket", {
  bucketName: "cdk-cff-site-bucket",
});

const rewriteFunction = new cloudfront.CfnFunction(stack, "RewriteFunction", {
  name: "cdk-rewrite-function",
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
        domainName: "cdk-cff-site-bucket.s3.amazonaws.com",
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

    // And the same handler file is imported as the real binding function used
    // by simulated CloudFormation.
    const handlerModule = (await import(pathToFileURL(handlerFile).href)) as {
      readonly handler: CloudFrontFunction.ViewerRequestHandler;
    };

    // And the CDK app is synthesized to a CloudFormation template.
    const cdkOutDir = await cdkProject.synth();

    // When the synthesized template is deployed through sim CloudFormation with a
    // binding for the CloudFront Function logical ID.
    const stack = await simAws.cloudFormation().deployTemplateFile({
      templatePath: path.join(cdkOutDir, "TestStack.template.json"),
      bindings: [
        {
          logicalId: "RewriteFunction",
          handler: handlerModule.handler,
        },
      ],
    });

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

    // And requests through the Distribution execute the bound handler function.
    const distroSubdomain = distro.distributionId.toLowerCase();
    const res = await fetch(
      `http://${distroSubdomain}.cloudfront.net.sim-aws.localhost:${srv.port}/redirect-me.html`,
      { redirect: "manual" },
    );

    assertIdentical(res.status, 302);
    assertIdentical(
      res.headers.get("location"),
      "https://example.test/from-bound-handler.html",
    );
  });
});
