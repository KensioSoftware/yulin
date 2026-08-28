import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimAcm } from "../../sim-acm.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import type { SimAcmDomainValidation } from "../../certificate/sim-acm-domain-validation.js";
import { SimAcmDnsValidationFailed } from "../../error/sim-acm.error.js";
import { SimCfnAcmValidationRecords } from "./sim-cfn-acm-validation-records.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnAcmCertificateValidationProperties {
  readonly acm: SimAcm;
  readonly simAws: SimAws;
}

/**
 * Validates a CloudFormation-created sim ACM Certificate.
 *
 * Real CloudFormation publishes the validation record itself when a
 * DomainValidationOptions entry carries a HostedZoneId, and holds the stack
 * until the certificate is issued, so nothing depending on the certificate is
 * created before it exists. This does the same.
 */
export class SimCfnAcmCertificateValidation {
  private readonly acm: SimAcm;
  private readonly simAws: SimAws;

  constructor(properties: SimCfnAcmCertificateValidationProperties) {
    this.acm = properties.acm;
    this.simAws = properties.simAws;
  }

  /**
   * Publish the template's validation records and wait for the Certificate.
   */
  async apply(
    resource: SimCfnResource,
    certificate: SimAcmCertificate,
    hostedZoneIdsByDomain: ReadonlyMap<string, string>,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const { accountId, regionName } = resource.accountRegionScope;
    const validationRecords = new SimCfnAcmValidationRecords({
      route53: this.simAws.accountRegionScope(accountId, regionName).route53(),
    });

    await validationRecords.publish(
      certificate,
      hostedZoneIdsByDomain,
      options,
    );
    await this.acm.settleCertificateValidation(certificate);

    if (certificate.status === "ISSUED") {
      return;
    }

    throw new SimAcmDnsValidationFailed(
      this.pendingMessage(resource.logicalId, certificate),
    );
  }

  /**
   * Explain what the Certificate is still waiting for.
   *
   * Real CloudFormation sits in CREATE_IN_PROGRESS here for hours and then
   * times out, which is no use in a test, so the Resource fails instead, with
   * the records that would have to exist for it to succeed.
   */
  private pendingMessage(
    logicalId: string,
    certificate: SimAcmCertificate,
  ): string {
    const waitingFor = certificate.domainValidationOptions
      .filter((domainValidation) => domainValidation.isPending)
      .map((domainValidation) => this.describePending(domainValidation))
      .join(", ");

    return (
      `AWS::CertificateManager::Certificate ${logicalId} was not issued: ` +
      `sim ACM Certificate ${certificate.certificateArn} is still waiting for ${waitingFor}. ` +
      "Name the Hosted Zone in DomainValidationOptions[].HostedZoneId so CloudFormation can publish it."
    );
  }

  private describePending(domainValidation: SimAcmDomainValidation): string {
    const recordName =
      domainValidation.resourceRecord?.name ?? "its validation record";

    return `${recordName} (${domainValidation.domainName})`;
  }
}
