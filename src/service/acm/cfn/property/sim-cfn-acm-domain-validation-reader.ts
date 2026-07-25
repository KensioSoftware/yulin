import type { SimRequestCertificateDomainValidationOption } from "../../command/request-certificate/request-certificate.command.js";
import { isRecord } from "../../../../util/type-guard/record.js";

interface SimCfnAcmDomainValidationReaderProperties {
  readonly logicalId: string;
}

/**
 * Reads AWS::ACM::Certificate DomainValidationOptions.
 *
 * This property carries two unrelated things, which is why it has its own
 * reader. `DomainName` and `ValidationDomain` are ACM API fields and go into
 * the request-certificate command. `HostedZoneId` is CloudFormation-only, with
 * no equivalent in the ACM API, and tells CloudFormation where to publish the
 * validation record.
 */
export class SimCfnAcmDomainValidationReader {
  private readonly logicalId: string;

  constructor(properties: SimCfnAcmDomainValidationReaderProperties) {
    this.logicalId = properties.logicalId;
  }

  /**
   * Read the ACM request-certificate fields of each entry.
   */
  options(
    value: unknown,
  ): readonly SimRequestCertificateDomainValidationOption[] {
    return this.entries(value).map((item, index) => this.option(item, index));
  }

  /**
   * Read the Hosted Zone each entry names, keyed by domain name.
   *
   * Entries naming no Hosted Zone are left out, so an empty result means
   * CloudFormation has no validation record to publish.
   */
  hostedZoneIds(value: unknown): ReadonlyMap<string, string> {
    const hostedZoneIds = new Map<string, string>();

    for (const [index, item] of this.entries(value).entries()) {
      const domainName = this.option(item, index).DomainName;
      const hostedZoneId = this.hostedZoneId(item, index);

      if (domainName !== undefined && hostedZoneId !== undefined) {
        hostedZoneIds.set(domainName, hostedZoneId);
      }
    }

    return hostedZoneIds;
  }

  private entries(value: unknown): readonly unknown[] {
    if (!Array.isArray(value)) {
      throw this.propertyError("DomainValidationOptions", "must be an array");
    }

    return value as readonly unknown[];
  }

  private option(
    value: unknown,
    index: number,
  ): SimRequestCertificateDomainValidationOption {
    const record = this.entryRecord(value, index);

    return {
      DomainName: this.entryString(record["DomainName"], index, "DomainName"),
      ValidationDomain: this.entryString(
        record["ValidationDomain"],
        index,
        "ValidationDomain",
      ),
    };
  }

  private hostedZoneId(value: unknown, index: number): string | undefined {
    const record = this.entryRecord(value, index);

    return this.entryString(record["HostedZoneId"], index, "HostedZoneId");
  }

  private entryRecord(value: unknown, index: number): Record<string, unknown> {
    if (!isRecord(value)) {
      throw this.propertyError(this.entryPath(index), "must be an object");
    }

    return value;
  }

  private entryString(
    value: unknown,
    index: number,
    fieldName: "DomainName" | "ValidationDomain" | "HostedZoneId",
  ): string | undefined {
    if (value !== undefined && typeof value !== "string") {
      throw this.propertyError(
        `${this.entryPath(index)}.${fieldName}`,
        "must be a string",
      );
    }

    return value;
  }

  private entryPath(index: number): string {
    return `DomainValidationOptions[${String(index)}]`;
  }

  private propertyError(propertyPath: string, reason: string): Error {
    return new Error(
      `Invalid AWS::ACM::Certificate Resource ${this.logicalId} property ${propertyPath}: ${reason}`,
    );
  }
}
