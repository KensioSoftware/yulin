import { afterAll, beforeAll, describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and asset manifest to pass to sim CloudFormation.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { SimAwsLocalServer } from "../../../../serve/index.js";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";
import path from "node:path";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringLength,
  assertStringStartsWith,
  describeResponse,
} from "@kensio/smartass";

describe("Sim CDK website deployment local integration", () => {
  const simAws = new SimAws();

  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("deploys test demo project into sim AWS", async () => {
    // Given a small test demo project.
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile("public/index.html", "<h1>Root</h1>");
    await projectDirectory.writeFile("public/foo/index.html", "<h1>Foo</h1>");

    // Including a CFF.
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
  
  if (event.request.uri.endsWith("/")) {
    event.request.uri += "index.html";
  }

  return event.request;
}
`,
    );

    const handlerFile = projectDirectory.join("cff/rewrite-function.js");

    // And a CDK stack to deploy the test demo project.
    const publicDirectory = projectDirectory.join("public");
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { aws_certificatemanager as acm } from "aws-cdk-lib";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as route53 from "aws-cdk-lib/aws-route53";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "us-east-1" },
});

const siteBucket = new s3.Bucket(stack, "SiteBucket", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  autoDeleteObjects: false,
});

const redirectFunction = new cloudfront.Function(
  stack,
  "RedirectFunction",
  {
    code: cloudfront.FunctionCode.fromFile({
      filePath: ${JSON.stringify(handlerFile)},
    }),
  },
);

const domainName = "example.test";
const hostedZone = new route53.HostedZone(stack, "SiteHostedZone", {
  zoneName: domainName,
});
const certificate = new acm.Certificate(stack, "Certificate", {
  domainName,
  // The distribution serves www, so the certificate has to cover it too.
  // CloudFront rejects a distribution whose alternate domain names its viewer
  // certificate does not cover.
  subjectAlternativeNames: ["www.example.test"],
  validation: acm.CertificateValidation.fromDns(hostedZone),
});

const distribution = new cloudfront.Distribution(stack, "SiteDistribution", {
  defaultRootObject: "index.html",
  domainNames: ["www.example.test"],
  certificate,
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
    compress: true,
    functionAssociations: [
      {
        function: redirectFunction,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      },
    ],
  },
  errorResponses: [
    {
      httpStatus: 403,
      responseHttpStatus: 404,
      responsePagePath: "/404.html",
      ttl: cdk.Duration.minutes(5),
    },
    {
      httpStatus: 404,
      responseHttpStatus: 404,
      responsePagePath: "/404.html",
      ttl: cdk.Duration.minutes(5),
    },
  ],
});

new route53.CnameRecord(stack, "SiteCnameRecord", {
  zone: hostedZone,
  recordName: "www",
  domainName: distribution.distributionDomainName,
  ttl: cdk.Duration.minutes(5),
});

new s3deploy.BucketDeployment(stack, "DeploySite", {
  sources: [s3deploy.Source.asset(${JSON.stringify(publicDirectory)})],
  destinationBucket: siteBucket,
  distribution,
  distributionPaths: ["/*"],
  prune: true,
});

new cdk.CfnOutput(stack, "SiteBucketName", {
  value: siteBucket.bucketName,
});
new cdk.CfnOutput(stack, "CloudFrontDistributionId", {
  value: distribution.distributionId,
});
new cdk.CfnOutput(stack, "DistributionDomainName", {
  value: distribution.distributionDomainName,
});
new cdk.CfnOutput(stack, "SiteHostname", {
  value: "www.example.test",
});
new cdk.CfnOutput(stack, "CertArn", {
  value: certificate.certificateArn,
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
    await simAws.backgroundTasksComplete();

    // Then the Outputs should be available.
    assertStringStartsWith(
      stack.outputs.get("SiteBucketName")?.value,
      "sitebucket",
    );
    const distroId = stack.outputs.get("CloudFrontDistributionId")?.value;
    assertStringLength(distroId, 14);
    const distroSubdomain = stack.outputs.get("DistributionDomainName")?.value;
    assertIdentical(
      distroSubdomain,
      `${distroId.toLowerCase()}.cloudfront.net`,
    );
    const siteHostname = stack.outputs.get("SiteHostname")?.value;
    assertIdentical(siteHostname, "www.example.test");
    const certArn = stack.outputs.get("CertArn")?.value;
    assertStringStartsWith(certArn, "arn:aws:acm:");

    // And we should be able to interact with the test demo project.
    const distroResponse = await fetch(
      `http://${distroSubdomain}.sim-aws.localhost:${srv.port}/foo/`,
    );
    assertResponseStatus(
      distroResponse,
      200,
      await describeResponse(distroResponse),
    );
    const redirectedResponse = await fetch(
      `http://${siteHostname}.sim-aws.localhost:${srv.port}/redirect-me.html`,
      { redirect: "manual" },
    );
    assertResponseStatus(
      redirectedResponse,
      302,
      await describeResponse(redirectedResponse),
    );

    const fooResponse = await fetch(
      `http://${siteHostname}.sim-aws.localhost:${srv.port}/foo/`,
    );
    assertResponseStatus(fooResponse, 200, await describeResponse(fooResponse));
    assertIdentical(await fooResponse.text(), "<h1>Foo</h1>");
  });
});
