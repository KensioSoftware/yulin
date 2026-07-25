import type { SimAcmValidationMethod } from "../../certificate/sim-acm-certificate.js";
import type {
  SimRequestCertificateDomainValidationOption,
  SimRequestCertificateTag,
} from "../../command/request-certificate/request-certificate.command.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnAcmCertificatePropertyListReader } from "./sim-cfn-acm-cert-prop-reader.js";

interface SimCfnAcmCertificateProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads and validates CloudFormation AWS::ACM::Certificate properties for
 * sim ACM certificate creation.
 */
export class SimCfnAcmCertificatePropertyReader {
  private readonly logicalId: string;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly listReader: SimCfnAcmCertificatePropertyListReader;

  constructor(properties: SimCfnAcmCertificateProperties) {
    this.logicalId = properties.logicalId;
    this.properties = properties.properties;
    this.listReader = new SimCfnAcmCertificatePropertyListReader({
      logicalId: this.logicalId,
    });
  }

  /**
   * Get the Certificate DomainName property.
   */
  domainName(): string | undefined {
    const value = this.properties["DomainName"];

    /* v8 ignore if */
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.propertyError("DomainName", "must be a string");
    }

    return value;
  }

  /**
   * Get the Certificate SubjectAlternativeNames property.
   */
  subjectAlternativeNames(): readonly string[] | undefined {
    const value = this.properties["SubjectAlternativeNames"];

    if (value === undefined) {
      return undefined;
    }

    return this.listReader.subjectAlternativeNames(value);
  }

  /**
   * Get the Certificate ValidationMethod property.
   */
  validationMethod(): SimAcmValidationMethod | undefined {
    const value = this.properties["ValidationMethod"];

    /* v8 ignore if */
    if (value === undefined) {
      return undefined;
    }

    if (value !== "DNS" && value !== "EMAIL") {
      throw this.propertyError("ValidationMethod", "must be DNS or EMAIL");
    }

    return value;
  }

  /**
   * Get the Certificate DomainValidationOptions property.
   */
  domainValidationOptions():
    readonly SimRequestCertificateDomainValidationOption[] | undefined {
    const value = this.properties["DomainValidationOptions"];

    if (value === undefined) {
      return undefined;
    }

    return this.listReader.domainValidationOptions(value);
  }

  /**
   * Get the Certificate Tags property.
   */
  tags(): readonly SimRequestCertificateTag[] | undefined {
    const value = this.properties["Tags"];

    if (value === undefined) {
      return undefined;
    }

    return this.listReader.tags(value);
  }

  private propertyError(propertyPath: string, reason: string): Error {
    return new Error(
      `Invalid AWS::ACM::Certificate Resource ${this.logicalId} property ${propertyPath}: ${reason}`,
    );
  }
}
