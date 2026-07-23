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
  describeResponse,
} from "@kensio/smartass";

describe("Sim CDK website deployment local integration", () => {
  const simAws = new SimAws();

  const srv: SimAwsLocalServer = new SimAwsLocalServer({ simAws });

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(() => {
    srv.close();
  });

  it("deploys test demo project into sim AWS", async () => {
    // Given a small test demo project.
    const projectDirectory = new TemporaryDirectory();
    await projectDirectory.writeFile("public/index.html", "<h1>Root</h1>");

    // And a CDK stack to deploy the test demo project.
    const publicDir = projectDirectory.join("public");
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib";
import { aws_certificatemanager as acm } from "aws-cdk-lib";
import { aws_cloudfront as cloudfront } from "aws-cdk-lib";
import { aws_cloudfront_origins as origins } from "aws-cdk-lib";
import { aws_route53 as route53 } from "aws-cdk-lib";
import { aws_route53_targets as route53Targets } from "aws-cdk-lib";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_s3_deployment as s3Deployment } from "aws-cdk-lib";
import { Construct } from "constructs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "us-east-1" },
});

const domainName = "yulin-demo-website.com";

const hostedZone = new route53.HostedZone(stack, "HostedZone", {
  zoneName: domainName,
});

const certificate = new acm.Certificate(stack, "Certificate", {
  domainName,
  validation: acm.CertificateValidation.fromDns(hostedZone),
});

const websiteBucket = new s3.Bucket(stack, "WebsiteBucket", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  autoDeleteObjects: false,
});

const distribution = new cloudfront.Distribution(stack, "Distribution", {
  defaultRootObject: "index.html",
  domainNames: [domainName],
  certificate,
  minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
    compress: true,
    functionAssociations: [],
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

new s3Deployment.BucketDeployment(stack, "WebsiteDeployment", {
  sources: [s3Deployment.Source.asset(${JSON.stringify(publicDir)})],
  destinationBucket: websiteBucket,
  distribution,
  distributionPaths: ["/*"],
});

new route53.ARecord(stack, "AliasRecord", {
  zone: hostedZone,
  recordName: domainName,
  target: route53.RecordTarget.fromAlias(
    new route53Targets.CloudFrontTarget(distribution),
  ),
});

new route53.AaaaRecord(stack, "Ipv6AliasRecord", {
  zone: hostedZone,
  recordName: domainName,
  target: route53.RecordTarget.fromAlias(
    new route53Targets.CloudFrontTarget(distribution),
  ),
});

new cdk.CfnOutput(stack, "WebsiteUrl", {
  value: \`https://\${domainName}\`,
});

new cdk.CfnOutput(stack, "DistributionDomainName", {
value: distribution.distributionDomainName,
});

new cdk.CfnOutput(stack, "BucketName", {
value: websiteBucket.bucketName,
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
    const websiteUrl = stack.outputs.get("WebsiteUrl")?.value;
    assertIdentical(websiteUrl, "https://yulin-demo-website.com");
    const localUrl = srv.localUrl(websiteUrl);

    // And we should be able to interact with the test demo project.
    const rootRes = await fetch(new URL("/index.html", localUrl));
    assertResponseStatus(rootRes, 200, await describeResponse(rootRes));
    assertIdentical(await rootRes.text(), "<h1>Root</h1>");
  });
});
