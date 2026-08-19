import { describe, it } from "vitest";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";

/**
 * A template with one Distribution using the given certificate ARN.
 *
 * CloudFormation spells the field `AcmCertificateArn`, unlike the CloudFront
 * API's `ACMCertificateArn`.
 */
function distributionTemplate(certificateArn: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            CallerReference: "cfn-viewer-certificate",
            Comment: "CloudFormation viewer certificate distribution",
            Enabled: true,
            Aliases: ["example.test"],
            DefaultCacheBehavior: {
              TargetOriginId: "origin",
              ViewerProtocolPolicy: "redirect-to-https",
            },
            ViewerCertificate: {
              AcmCertificateArn: certificateArn,
              SslSupportMethod: "sni-only",
            },
          },
        },
      },
    },
    Outputs: {
      DistributionId: {
        Value: { Ref: "SiteDistribution" },
      },
    },
  };
}

// A real-shaped certificate ARN, as a CDK app that took the ARN from another
// stack would carry into its template.
const passedInCertificateArn =
  "arn:aws:acm:us-east-1:111122223333:certificate/3b82191c-b029-4e5f-a94f-038f98a53ede";

/**
 * Register a Certificate on the ARN the template names, in the Account and
 * Region that ARN belongs to.
 */
function registerCertificate(simAws: SimAws, domainName: string): void {
  simAws.account("111122223333").region("us-east-1").acm().registerCertificate({
    arn: passedInCertificateArn,
    domainName,
  });
}

async function issuedCertificateArn(
  simAws: SimAws,
  regionName: "us-east-1" | "eu-west-2",
): Promise<string> {
  const output = await simAws
    .region(regionName)
    .acm()
    .requestCertificate({ input: { DomainName: "example.test" } });
  await simAws.backgroundTasksComplete();
  assertNonNullable(output.CertificateArn);

  return output.CertificateArn;
}

describe("Sim CloudFormation CloudFront viewer certificate", () => {
  it("creates a distribution with a us-east-1 certificate", async () => {
    // Given an issued certificate in us-east-1.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(simAws, "us-east-1");

    // When a template names it as the viewer certificate.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cloudfront-viewer-certificate-stack",
      template: distributionTemplate(certificateArn),
    });
    await stack.waitForDeployComplete();

    // Then the distribution is created.
    assertTypeString(stack.outputs.get("DistributionId")?.value);
  });

  it("creates a distribution with a registered certificate", async () => {
    // Given a Certificate registered under the ARN the template carries.
    const simAws = new SimAws();
    registerCertificate(simAws, "example.test");

    // When a template names it as the viewer certificate.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "cloudfront-registered-certificate-stack",
      template: distributionTemplate(passedInCertificateArn),
    });
    await stack.waitForDeployComplete();

    // Then the distribution is created, with no certificate to request first.
    assertTypeString(stack.outputs.get("DistributionId")?.value);
  });

  it("fails the stack for an alias the registered certificate misses", async () => {
    // Given a registered Certificate for another domain name.
    const simAws = new SimAws();
    registerCertificate(simAws, "other.test");

    // When a template names it as the viewer certificate.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "cloudfront-uncovered-alias-stack",
        template: distributionTemplate(passedInCertificateArn),
      });
      await stack.waitForDeployComplete();
    });

    // Then the stack fails, naming the alias the Certificate does not cover.
    assertStringIncludes(error.message, "SiteDistribution");
    assertStringIncludes(error.message, "example.test");
  });

  it("fails the stack for a certificate outside us-east-1", async () => {
    // Given an issued certificate in another region.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(simAws, "eu-west-2");

    // When a template names it as the viewer certificate.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "cloudfront-wrong-region-stack",
        template: distributionTemplate(certificateArn),
      });
      await stack.waitForDeployComplete();
    });

    // Then the stack fails, naming the resource and both regions.
    assertStringIncludes(error.message, "SiteDistribution");
    assertStringIncludes(error.message, "eu-west-2");
    assertStringIncludes(error.message, "us-east-1");
  });
});
