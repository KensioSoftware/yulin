import type {
  SimRequestCertificateDomainValidationOption,
  SimRequestCertificateTag,
} from "../../command/request-certificate/request-certificate.cmd.js";
import { isRecord } from "../../../../util/type-guard/record.js";

interface SimCfnAcmCertificatePropertyListReaderProps {
  readonly logicalId: string;
}

/**
 * Reads AWS::ACM::Certificate properties whose CloudFormation shape is an
 * array.
 *
 * This class keeps array traversal and nested object validation out of
 * SimCfnAcmCertificateProperties. The outer properties reader stays focused on
 * top-level CloudFormation fields, while this reader owns the repeated rules
 * for list properties:
 *
 * - the property must be an array when it is present;
 * - each array item is validated with an index-aware error path;
 * - nested optional string fields are checked before being returned to the
 *   request-certificate command shape.
 */
export class SimCfnAcmCertificatePropertyListReader {
  private readonly logicalId: string;

  constructor(props: SimCfnAcmCertificatePropertyListReaderProps) {
    this.logicalId = props.logicalId;
  }

  /**
   * Read Certificate SubjectAlternativeNames.
   *
   * CloudFormation accepts this property as a list of DNS names. The simulator
   * stores the already-resolved template values, so each entry must be a plain
   * string by this point.
   */
  subjectAlternativeNames(value: unknown): readonly string[] {
    this.assertArray(value, "SubjectAlternativeNames");

    for (const [index, item] of value.entries()) {
      if (typeof item !== "string") {
        throw this.propertyError(
          `SubjectAlternativeNames[${String(index)}]`,
          "must be a string",
        );
      }
    }

    return value as readonly string[];
  }

  /**
   * Read Certificate DomainValidationOptions.
   *
   * Each option is a small object with optional string fields. The simulator
   * returns the command input shape because the ACM resource factory can pass it
   * directly into the request-certificate flow.
   */
  domainValidationOptions(
    value: unknown,
  ): readonly SimRequestCertificateDomainValidationOption[] {
    this.assertArray(value, "DomainValidationOptions");

    return value.map((item, index) => this.domainValidationOption(item, index));
  }

  /**
   * Read Certificate Tags.
   *
   * Tags follow the AWS SDK command shape where Key and Value are optional
   * strings. Invalid nested values are reported with the exact array index so a
   * failing template is easy to locate.
   */
  tags(value: unknown): readonly SimRequestCertificateTag[] {
    this.assertArray(value, "Tags");

    return value.map((item, index) => this.tag(item, index));
  }

  private assertArray(
    value: unknown,
    propertyName:
      "SubjectAlternativeNames" | "DomainValidationOptions" | "Tags",
  ): asserts value is unknown[] {
    if (!Array.isArray(value)) {
      throw this.propertyError(propertyName, "must be an array");
    }
  }

  private domainValidationOption(
    value: unknown,
    index: number,
  ): SimRequestCertificateDomainValidationOption {
    const propertyPath = `DomainValidationOptions[${String(index)}]`;

    if (!isRecord(value)) {
      throw this.propertyError(propertyPath, "must be an object");
    }

    const domainName = value["DomainName"];
    const validationDomain = value["ValidationDomain"];

    if (domainName !== undefined && typeof domainName !== "string") {
      throw this.propertyError(
        `${propertyPath}.DomainName`,
        "must be a string",
      );
    }

    if (
      validationDomain !== undefined &&
      typeof validationDomain !== "string"
    ) {
      throw this.propertyError(
        `${propertyPath}.ValidationDomain`,
        "must be a string",
      );
    }

    return {
      DomainName: domainName,
      ValidationDomain: validationDomain,
    };
  }

  private tag(value: unknown, index: number): SimRequestCertificateTag {
    const propertyPath = `Tags[${String(index)}]`;

    if (!isRecord(value)) {
      throw this.propertyError(propertyPath, "must be an object");
    }

    const key = value["Key"];
    const tagValue = value["Value"];

    if (key !== undefined && typeof key !== "string") {
      throw this.propertyError(`${propertyPath}.Key`, "must be a string");
    }

    if (tagValue !== undefined && typeof tagValue !== "string") {
      throw this.propertyError(`${propertyPath}.Value`, "must be a string");
    }

    return {
      Key: key,
      Value: tagValue,
    };
  }

  private propertyError(propertyPath: string, reason: string): Error {
    return new Error(
      `Invalid AWS::ACM::Certificate Resource ${this.logicalId} property ${propertyPath}: ${reason}`,
    );
  }
}
