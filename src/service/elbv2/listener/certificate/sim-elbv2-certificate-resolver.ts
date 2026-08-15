import type { SimAcmCertificate } from "../../../acm/certificate/sim-acm-certificate.js";
import type { SimAcmRegistry } from "../../../acm/registry/sim-acm-registry.js";
import { parseSimArn } from "../../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimElbV2Certificate } from "../../command/sim-elbv2-shared.command.js";
import {
  SimElbV2CertificateNotFoundException,
  SimElbV2InvalidConfigurationRequestException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import { simElbV2CertificateArn } from "./sim-elbv2-certificate-arns.js";

interface SimElbV2CertificateResolverProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  /**
   * The simulation's index of ACM facades. With none there is no simulated ACM
   * to check a certificate against, as in a standalone `SimElbV2`, and nothing
   * is checked.
   */
  readonly acmRegistry?: SimAcmRegistry | undefined;
}

/**
 * Gets from the certificates a request names to the ARNs a listener holds.
 *
 * A certificate that does not exist, or that is still pending validation, is
 * refused here rather than held, which is the whole point of connecting these
 * two simulations: a listener that says it is serving HTTPS with a certificate
 * a stack never got issued would serve requests here and fail to deploy on real
 * AWS.
 *
 * Nothing is decrypted or presented to a client, since no TLS is performed.
 * What is checked is the configuration relationship, which is the part a test
 * can be written about.
 */
export class SimElbV2CertificateResolver {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly acmRegistry: SimAcmRegistry | undefined;

  constructor(properties: SimElbV2CertificateResolverProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.acmRegistry = properties.acmRegistry;
  }

  /**
   * The one certificate a listener request may name, if it names any.
   */
  private static onlyOne(
    certificates: readonly SimElbV2Certificate[] | undefined,
    field: string,
  ): SimElbV2Certificate | undefined {
    const [first, second] = certificates ?? [];

    if (second !== undefined) {
      throw new SimElbV2InvalidConfigurationRequestException(
        `${field} names more than one certificate, and a listener takes one ` +
          `default certificate. The rest go on with AddListenerCertificates.`,
      );
    }

    return first;
  }

  /**
   * Refuse a certificate that was not issued.
   */
  private static requireIssuedStatus(certificate: SimAcmCertificate): void {
    if (certificate.status === "ISSUED") {
      return;
    }

    throw new SimElbV2InvalidConfigurationRequestException(
      `Certificate ${certificate.certificateArn} is ${certificate.status}, ` +
        `not ISSUED, so a listener presenting it could not serve a request`,
    );
  }

  /**
   * Refuse any of these certificates simulated ACM does not hold as an issued
   * one.
   */
  requireAllIssued(certificateArns: readonly string[]): void {
    for (const arn of certificateArns) {
      this.requireIssued(arn);
    }
  }

  /**
   * Read the default certificate a listener request names, if it names one.
   *
   * A listener takes exactly one default certificate, as real ELB does, so a
   * request naming several is refused with the operation that carries the rest.
   */
  resolveDefault(
    certificates: readonly SimElbV2Certificate[] | undefined,
    field: string,
  ): string | undefined {
    const certificate = SimElbV2CertificateResolver.onlyOne(
      certificates,
      field,
    );

    if (certificate === undefined) {
      return undefined;
    }

    const arn = simElbV2CertificateArn(certificate, field);
    this.requireIssued(arn);

    return arn;
  }

  /**
   * Refuse a certificate simulated ACM does not hold as an issued one.
   */
  private requireIssued(arn: string): void {
    const acmRegistry = this.acmRegistry;

    if (acmRegistry === undefined) {
      return;
    }

    this.requireOwnScope(arn);

    const certificate = acmRegistry.certificate(arn);

    if (certificate === undefined) {
      throw new SimElbV2CertificateNotFoundException(
        `Certificate ${arn} was not found in simulated ACM`,
      );
    }

    SimElbV2CertificateResolver.requireIssuedStatus(certificate);
  }

  /**
   * Refuse a certificate from another Account or Region.
   *
   * Real ELB takes a certificate from the load balancer's own Account and
   * Region only, which is the same mistake CloudFront's us-east-1 rule catches
   * and one a template can carry for a long time before it is deployed.
   */
  private requireOwnScope(arn: string): void {
    const parsed = parseSimArn(arn);
    const { accountId, regionName } = this.accountRegionScope;

    if (parsed === undefined) {
      throw new SimElbV2ValidationError(
        `Certificate ${arn} is not an ACM certificate ARN`,
      );
    }

    if (parsed.accountId === accountId && parsed.region === regionName) {
      return;
    }

    throw new SimElbV2InvalidConfigurationRequestException(
      `Certificate ${arn} is in ${parsed.accountId} ${parsed.region}, and a ` +
        `listener takes a certificate from its load balancer's own Account ` +
        `and Region, which is ${accountId} ${regionName}`,
    );
  }
}
