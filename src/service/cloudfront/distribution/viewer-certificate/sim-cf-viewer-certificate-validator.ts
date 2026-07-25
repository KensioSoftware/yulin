import type { SimAcmRegistry } from "../../../acm/registry/sim-acm-registry.js";
import type { SimAcmCertificate } from "../../../acm/certificate/sim-acm-certificate.js";
import { parseSimArn } from "../../../aws/arn.js";
import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.command.js";
import { SimCloudFrontInvalidViewerCertificate } from "../../error/sim-cloudfront.error.js";
import { SimCloudFrontAliasCoverage } from "./sim-cf-alias-coverage.js";

/**
 * The only Region CloudFront accepts an ACM certificate from.
 */
const cloudFrontCertificateRegion = "us-east-1";

interface SimCloudFrontViewerCertificateValidatorProperties {
  readonly acmRegistry?: SimAcmRegistry | undefined;
}

/**
 * Checks the viewer certificate on a sim CloudFront Distribution.
 *
 * These are configuration mistakes real CloudFront rejects at deploy time,
 * well after the template looked fine, so catching them here is the point:
 * an ACM certificate outside us-east-1 is one of the most common AWS
 * deployment gotchas there is.
 *
 * With no ACM registry there is no simulated ACM to check against, as in a
 * standalone SimCloudFront, so nothing is checked.
 */
export class SimCloudFrontViewerCertificateValidator {
  private readonly acmRegistry: SimAcmRegistry | undefined;

  constructor(
    properties: SimCloudFrontViewerCertificateValidatorProperties = {},
  ) {
    this.acmRegistry = properties.acmRegistry;
  }

  /**
   * Validate the viewer certificate a DistributionConfig asks for.
   */
  validate(distributionConfig: SimCloudFrontDistributionConfig): void {
    const acmRegistry = this.acmRegistry;
    const viewerCertificate = distributionConfig.ViewerCertificate;
    // The CloudFront API and CloudFormation capitalise this field
    // differently, so a template and an SDK call arrive spelled differently.
    const certificateArn =
      viewerCertificate?.ACMCertificateArn ??
      viewerCertificate?.AcmCertificateArn;

    if (acmRegistry === undefined || certificateArn === undefined) {
      return;
    }

    this.assertCertificateRegion(certificateArn);

    const certificate = acmRegistry.certificate(certificateArn);

    if (certificate === undefined) {
      throw new SimCloudFrontInvalidViewerCertificate(
        `Sim CloudFront ViewerCertificate ${certificateArn} was not found in sim ACM`,
      );
    }

    this.assertCertificateIssued(certificate);
    this.assertAliasesCovered(distributionConfig, certificate);
  }

  /**
   * CloudFront only accepts certificates from us-east-1, wherever the
   * Distribution's other resources live.
   */
  private assertCertificateRegion(certificateArn: string): void {
    const region = parseSimArn(certificateArn)?.region;

    if (region === undefined) {
      throw new SimCloudFrontInvalidViewerCertificate(
        `Sim CloudFront ViewerCertificate AcmCertificateArn ${certificateArn} is not an ACM Certificate ARN`,
      );
    }

    if (region === cloudFrontCertificateRegion) {
      return;
    }

    throw new SimCloudFrontInvalidViewerCertificate(
      `Sim CloudFront ViewerCertificate ${certificateArn} is in ${region}, ` +
        `but CloudFront only accepts ACM Certificates in ${cloudFrontCertificateRegion}`,
    );
  }

  private assertCertificateIssued(certificate: SimAcmCertificate): void {
    if (certificate.status === "ISSUED") {
      return;
    }

    throw new SimCloudFrontInvalidViewerCertificate(
      `Sim CloudFront ViewerCertificate ${certificate.certificateArn} is ${certificate.status}, not ISSUED`,
    );
  }

  private assertAliasesCovered(
    distributionConfig: SimCloudFrontDistributionConfig,
    certificate: SimAcmCertificate,
  ): void {
    const coverage = new SimCloudFrontAliasCoverage([
      certificate.domainName,
      ...certificate.subjectAlternativeNames,
    ]);
    const uncovered = coverage.uncovered(
      distributionConfig.Aliases?.Items ?? [],
    );

    if (uncovered.length === 0) {
      return;
    }

    throw new SimCloudFrontInvalidViewerCertificate(
      `Sim CloudFront Aliases ${uncovered.join(", ")} are not covered by ` +
        `ViewerCertificate ${certificate.certificateArn} for ${certificate.domainName}`,
    );
  }
}
