import { createHash } from "node:crypto";
import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimAcmCertificate,
  type SimAcmTag,
} from "../../certificate/sim-acm-certificate.js";
import {
  SimAcmDomainValidation,
  type SimAcmValidationMethod,
  type SimAcmValidationRecord,
} from "../../certificate/sim-acm-domain-validation.js";
import type { SimRequestCertificateCommand } from "./request-certificate.command.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface RequestCertificateFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Builds simulated ACM certificates for RequestCertificateCommand.
 *
 * The command handler keeps ownership of command validation, repository writes,
 * and background scheduling. This factory keeps the certificate-shaping rules
 * in one place: ARN assignment, validation method defaults, domain validation
 * options, deterministic DNS validation records, and tag copying.
 */
export class RequestCertificateFactory {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: RequestCertificateFactoryProperties) {
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Create the certificate entity that will be stored by the handler.
   *
   * The caller supplies the certificate count because the backing Map is owned
   * by the ACM service state. Keeping the count as an input avoids giving this
   * class write access to the certificate store while still producing stable
   * ARNs that match the existing simulator behavior.
   */
  makeCertificate(
    command: SimRequestCertificateCommand,
    certificateCount: number,
  ): SimAcmCertificate {
    const certificateArn = this.makeCertificateArn(certificateCount);
    const validationMethod = command.input.ValidationMethod ?? "DNS";
    const domainNames = [
      command.input.DomainName,
      ...(command.input.SubjectAlternativeNames ?? []),
    ];
    assertDefined(
      command.input.DomainName,
      "SimRequestCertificateCommand.input.DomainName required",
    );

    return new SimAcmCertificate({
      certificateArn,
      domainName: command.input.DomainName,
      subjectAlternativeNames: command.input.SubjectAlternativeNames ?? [],
      status: "PENDING_VALIDATION",
      validationMethod,
      domainValidationOptions: domainNames.map((domainName) => {
        assertDefined(
          domainName,
          "SimRequestCertificateCommand input DomainName / SubjectAlternativeNames required",
        );
        return this.makeDomainValidationOption(domainName, validationMethod);
      }),
      createdAt: new Date(),
      tags: command.input.Tags?.map((tag): SimAcmTag => ({
        Key: tag.Key,
        Value: tag.Value,
      })),
    });
  }

  /**
   * Generate the next simulator ARN in the current account and Region.
   *
   * ACM certificate IDs are represented as eight-digit sequence numbers to keep
   * test output stable and easy to read. The simulator does not need globally
   * unique randomness here because each ACM scope owns its own certificate Map.
   */
  private makeCertificateArn(certificateCount: number): SimArn {
    const certificateId = String(certificateCount + 1).padStart(8, "0");

    return `arn:aws:acm:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:certificate/${certificateId}`;
  }

  /**
   * Build the per-domain validation option returned by ACM.
   *
   * DNS validation includes a CNAME record. Other validation methods keep the
   * resource record unset, matching AWS SDK shapes where the record is only
   * available when ACM can provide one.
   */
  private makeDomainValidationOption(
    domainName: string,
    validationMethod: SimAcmValidationMethod,
  ): SimAcmDomainValidation {
    return new SimAcmDomainValidation({
      domainName,
      validationMethod,
      resourceRecord: this.makeResourceRecord(domainName, validationMethod),
    });
  }

  /**
   * Build the record ACM asks for, where the validation method has one.
   */
  private makeResourceRecord(
    domainName: string,
    validationMethod: SimAcmValidationMethod,
  ): SimAcmValidationRecord | undefined {
    if (validationMethod !== "DNS") {
      return undefined;
    }

    return this.makeValidationRecord(domainName);
  }

  /**
   * Build a deterministic DNS validation CNAME for a domain.
   *
   * The account, Region, and domain are part of the hash input, so the same
   * domain can receive different validation records in different simulated AWS
   * scopes. The short hash keeps records readable while remaining stable across
   * test runs.
   */
  private makeValidationRecord(domainName: string): SimAcmValidationRecord {
    const hash = createHash("sha256")
      .update(
        [
          this.accountRegionScope.accountId,
          this.accountRegionScope.regionName,
          domainName,
        ].join(":"),
      )
      .digest("hex")
      .slice(0, 16);

    return {
      name: `_yulin-acm-${hash}.${domainName}.`,
      type: "CNAME",
      value: `_yulin-acm-${hash}.acm-validations.aws.`,
    };
  }
}
