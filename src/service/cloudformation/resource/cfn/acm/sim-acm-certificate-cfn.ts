import type { SimAcmCertificate } from "../../../../acm/certificate/sim-acm-certificate.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimAcmCertificateCfnProperties {
  readonly certificate: SimAcmCertificate;
}

/**
 * CloudFormation-facing values for a simulated ACM Certificate.
 */
export class SimAcmCertificateCfn implements SimCfnResourceValueAdapter {
  private readonly certificate: SimAcmCertificate;

  constructor(properties: SimAcmCertificateCfnProperties) {
    this.certificate = properties.certificate;
  }

  /**
   * AWS::CertificateManager::Certificate Ref returns the certificate ARN.
   */
  refValue(): SimCfnTemplateValue {
    return this.certificate.certificateArn;
  }

  /**
   * AWS::CertificateManager::Certificate attributes supported by the simulator.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "CertificateArn": {
        return this.certificate.certificateArn;
      }
      case "CertificateStatus": {
        return this.certificate.status;
      }
      default: {
        /* v8 ignore next */
        throw new Error(
          `Unsupported AWS::CertificateManager::Certificate attribute ${attributeName}`,
        );
      }
    }
  }
}
