import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  CreateDistributionCommand,
  type DistributionConfig,
  type ViewerCertificate,
} from "@aws-sdk/client-cloudfront";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFront } from "../../sim-cloudfront.js";
import { SimCloudFrontInvalidViewerCertificate } from "../../error/sim-cloudfront.error.js";
import { issuedCertificateArn } from "./sim-cf-viewer-certificate.fixture.js";

/**
 * A minimal DistributionConfig with the given aliases and viewer certificate.
 */
function distributionConfig(
  aliases: readonly string[],
  certificateArn?: string,
): DistributionConfig {
  return {
    CallerReference: `viewer-certificate-${aliases.join("-")}`,
    Comment: "Viewer certificate test distribution",
    Enabled: true,
    Aliases: { Quantity: aliases.length, Items: [...aliases] },
    Origins: { Quantity: 0, Items: [] },
    DefaultCacheBehavior: {
      TargetOriginId: "origin",
      ViewerProtocolPolicy: "redirect-to-https",
    },
    ViewerCertificate: viewerCertificate(certificateArn),
  };
}

/**
 * An ACM viewer certificate, or the CloudFront default when there is no ARN.
 */
function viewerCertificate(
  certificateArn: string | undefined,
): ViewerCertificate {
  if (certificateArn === undefined) {
    return { CloudFrontDefaultCertificate: true };
  }

  return { ACMCertificateArn: certificateArn, SSLSupportMethod: "sni-only" };
}

describe("Sim CloudFront viewer certificate", () => {
  it("creates a distribution with an issued us-east-1 certificate", async () => {
    // Given an issued certificate in us-east-1 covering the alias.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(simAws, "example.test");

    // When a distribution is created with it as the viewer certificate.
    const output = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig(
          ["example.test"],
          certificateArn,
        ),
      }),
    );

    // Then the distribution is created.
    assertNonNullable(output.Distribution?.Id);
  });

  it("rejects a certificate outside us-east-1", async () => {
    // Given an issued certificate in another region, the common AWS gotcha.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(
      simAws,
      "example.test",
      "eu-west-2",
    );

    // When a distribution is created with it as the viewer certificate.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            ["example.test"],
            certificateArn,
          ),
        }),
      );
    });

    // Then it is rejected, naming the region the certificate is actually in.
    assertInstanceOf(error, SimCloudFrontInvalidViewerCertificate);
    assertStringIncludes(error.message, "eu-west-2");
    assertStringIncludes(error.message, "us-east-1");
  });

  it("rejects a certificate ARN that resolves to no certificate", async () => {
    // Given no certificates at all.
    const simAws = new SimAws();

    // When a distribution names a certificate that does not exist.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            ["example.test"],
            "arn:aws:acm:us-east-1:111111111111:certificate/00000009",
          ),
        }),
      );
    });

    // Then it is rejected as not found in sim ACM.
    assertInstanceOf(error, SimCloudFrontInvalidViewerCertificate);
    assertStringIncludes(error.message, "was not found in sim ACM");
  });

  it("rejects an AcmCertificateArn that is not an ARN", async () => {
    // Given a distribution config with a malformed certificate ARN.
    const simAws = new SimAws();

    // When the distribution is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            ["example.test"],
            "not-an-arn",
          ),
        }),
      );
    });

    // Then it is rejected as not an ACM certificate ARN.
    assertInstanceOf(error, SimCloudFrontInvalidViewerCertificate);
    assertStringIncludes(error.message, "is not an ACM Certificate ARN");
  });

  it("rejects a certificate that is not issued", async () => {
    // Given a certificate held pending by a hosted zone covering its domain.
    const simAws = new SimAws();
    await simAws.route53().createHostedZone({
      input: { Name: "example.test", CallerReference: "pending-cert" },
    });
    const certificateArn = await issuedCertificateArn(
      simAws,
      "api.example.test",
    );

    // When a distribution is created with it as the viewer certificate.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            ["api.example.test"],
            certificateArn,
          ),
        }),
      );
    });

    // Then it is rejected, naming the status it is actually in.
    assertInstanceOf(error, SimCloudFrontInvalidViewerCertificate);
    assertStringIncludes(error.message, "PENDING_VALIDATION");
  });

  it("rejects aliases the certificate does not cover", async () => {
    // Given an issued certificate for one domain.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(simAws, "example.test");

    // When a distribution uses an alias outside that certificate.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            ["other.test"],
            certificateArn,
          ),
        }),
      );
    });

    // Then it is rejected, naming the uncovered alias.
    assertInstanceOf(error, SimCloudFrontInvalidViewerCertificate);
    assertStringIncludes(error.message, "other.test");
  });

  it("accepts an alias covered by a wildcard certificate", async () => {
    // Given an issued wildcard certificate.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(simAws, "*.example.test");

    // When a distribution uses a subdomain alias.
    const output = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig(
          ["www.example.test"],
          certificateArn,
        ),
      }),
    );

    // Then the wildcard covers it and the distribution is created.
    assertNonNullable(output.Distribution?.Id);
  });

  it("creates a distribution with the CloudFront default certificate", async () => {
    // Given no certificate at all, as a distribution with no alternate domain
    // names has.
    const simAws = new SimAws();

    // When a distribution is created with the default certificate.
    const output = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig([]),
      }),
    );

    // Then no certificate is looked up and the distribution is created.
    assertNonNullable(output.Distribution?.Id);
  });

  it("resolves a certificate owned by another simulated account", async () => {
    // Given an issued us-east-1 certificate in another account.
    const simAws = new SimAws();
    const output = await simAws
      .account("222222222222")
      .region("us-east-1")
      .acm()
      .requestCertificate({ input: { DomainName: "example.test" } });
    await simAws.backgroundTasksComplete();
    assertNonNullable(output.CertificateArn);

    // When a distribution in the default account names it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: distributionConfig(
            ["other.test"],
            output.CertificateArn,
          ),
        }),
      );
    });

    // Then the certificate was resolved, since the failure is about coverage
    // rather than about the certificate being missing.
    assertStringIncludes(error.message, "are not covered by");
  });

  it("skips certificate checks on a standalone SimCloudFront", async () => {
    // Given CloudFront on its own, with no simulated ACM to check against.
    const simCloudFront = new SimCloudFront();

    // When a distribution names a certificate in the wrong region.
    const output = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig(
          ["example.test"],
          "arn:aws:acm:eu-west-2:111111111111:certificate/00000001",
        ),
      }),
    );

    // Then there is nothing to check it against and it is created.
    assertNonNullable(output.Distribution?.Id);
  });

  it("keeps the viewer certificate on the distribution config", async () => {
    // Given a distribution created with a viewer certificate.
    const simAws = new SimAws();
    const certificateArn = await issuedCertificateArn(simAws, "example.test");

    // When the distribution is created.
    const output = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: distributionConfig(
          ["example.test"],
          certificateArn,
        ),
      }),
    );

    // Then the viewer certificate is preserved in the returned config.
    assertIdentical(
      output.Distribution?.DistributionConfig?.ViewerCertificate
        ?.ACMCertificateArn,
      certificateArn,
    );
  });
});
