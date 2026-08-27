import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimAcm } from "../../sim-acm.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimCfnAcmCertificatePropertyReader } from "../property/sim-cfn-acm-cert-properties.js";
import { SimCfnAcmCertificateValidation } from "../validation/sim-cfn-acm-cert-validation.js";
import {
  simCfnResourceCallerOptions,
  type SimCfnResourceCallerOptions,
} from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnAcmCertificateCreatorProperties {
  readonly acm: SimAcm;
}

/**
 * Creates simulated ACM Certificates from CloudFormation Resources.
 *
 * Certificates are created through the normal request-certificate command
 * path rather than constructed directly, so a CloudFormation certificate is
 * the same thing an SDK caller would get.
 */
export class SimCfnAcmCertificateCreator {
  private readonly acm: SimAcm;

  constructor(properties: SimCfnAcmCertificateCreatorProperties) {
    this.acm = properties.acm;
  }

  /**
   * Create a Certificate from an AWS::CertificateManager::Certificate Resource.
   */
  async create(
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<SimAcmCertificate> {
    const properties = new SimCfnAcmCertificatePropertyReader({
      logicalId: resource.logicalId,
      properties: context.resolvedProperties ?? resource.properties,
    });

    const options = simCfnResourceCallerOptions(context.caller);
    const certificate = await this.requestCertificate(
      resource,
      properties,
      options,
    );

    // Creating the Resource is not complete until the certificate is issued,
    // so anything depending on it is created afterwards, as in real
    // CloudFormation.
    const certificateValidation = new SimCfnAcmCertificateValidation({
      acm: this.acm,
      simAws: context.simAws,
    });

    await certificateValidation.apply(
      resource,
      certificate,
      properties.domainValidationHostedZoneIds(),
      options,
    );

    return certificate;
  }

  private async requestCertificate(
    resource: SimCfnResource,
    properties: SimCfnAcmCertificatePropertyReader,
    options: SimCfnResourceCallerOptions,
  ): Promise<SimAcmCertificate> {
    const requestCertificateOutput = await this.acm.requestCertificate(
      {
        input: {
          DomainName: properties.domainName(),
          SubjectAlternativeNames: properties.subjectAlternativeNames(),
          ValidationMethod: properties.validationMethod(),
          DomainValidationOptions: properties.domainValidationOptions(),
          Tags: properties.tags(),
        },
      },
      options,
    );

    const certificateArn = requestCertificateOutput.CertificateArn;
    assertDefined(
      certificateArn,
      `sim ACM Certificate ARN after CloudFormation creation for ${resource.logicalId}`,
    );

    const certificate = this.acm.certificates.get(certificateArn);
    assertDefined(
      certificate,
      `sim ACM Certificate ${certificateArn} after CloudFormation creation`,
    );

    return certificate;
  }
}
