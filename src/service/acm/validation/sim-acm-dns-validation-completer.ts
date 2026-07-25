import type { SimArn } from "../../aws/arn.js";
import type { SimAcmCertificate } from "../certificate/sim-acm-certificate.js";
import {
  SimAcmDnsValidationFailed,
  SimAcmInvalidArgumentsException,
  SimAcmResourceNotFoundException,
} from "../error/sim-acm.error.js";
import type { SimAcmCertificateValidation } from "./sim-acm-certificate-validation.js";
import type { SimAcmDnsRecords } from "./sim-acm-dns-records.js";

interface SimAcmDnsValidationCompleterProperties {
  readonly certificates: ReadonlyMap<SimArn, SimAcmCertificate>;
  readonly validation: SimAcmCertificateValidation;
  readonly dnsRecords?: SimAcmDnsRecords | undefined;
}

/**
 * Creates the DNS validation records a pending sim Certificate is waiting for.
 *
 * This is the shortcut for users who want realistic DNS routing but not the
 * certificate ceremony: it writes each validation CNAME into the Hosted Zone
 * covering it, then settles the Certificate, so the Certificate is issued by
 * the time the call returns.
 */
export class SimAcmDnsValidationCompleter {
  private readonly certificates: ReadonlyMap<SimArn, SimAcmCertificate>;
  private readonly validation: SimAcmCertificateValidation;
  private readonly dnsRecords: SimAcmDnsRecords | undefined;

  constructor(properties: SimAcmDnsValidationCompleterProperties) {
    this.certificates = properties.certificates;
    this.validation = properties.validation;
    this.dnsRecords = properties.dnsRecords;
  }

  /**
   * Publish the validation records for a Certificate and wait for issuance.
   */
  async complete(certificateArn: string | undefined): Promise<void> {
    const certificate = this.findCertificate(certificateArn);
    const uncreatedRecordNames = this.createValidationRecords(certificate);

    await this.validation.settle(certificate);

    if (certificate.status === "ISSUED") {
      return;
    }

    throw new SimAcmDnsValidationFailed(
      `Cannot complete DNS validation of sim ACM Certificate ${certificate.certificateArn}: ` +
        `no sim Route53 Hosted Zone covers ${uncreatedRecordNames.join(", ")}`,
    );
  }

  /**
   * Resolve the Certificate this ARN refers to.
   */
  private findCertificate(
    certificateArn: string | undefined,
  ): SimAcmCertificate {
    if (certificateArn === undefined) {
      throw new SimAcmInvalidArgumentsException(
        "SimAcm.completeDnsValidation requires a CertificateArn",
      );
    }

    const certificate = this.certificates.get(certificateArn as SimArn);

    if (certificate === undefined) {
      throw new SimAcmResourceNotFoundException(
        `No sim ACM Certificate found with ARN ${certificateArn}`,
      );
    }

    return certificate;
  }

  /**
   * Create each validation record, reporting the names that had nowhere to go.
   */
  private createValidationRecords(
    certificate: SimAcmCertificate,
  ): readonly string[] {
    const dnsRecords = this.dnsRecords;

    if (dnsRecords === undefined) {
      return [];
    }

    const uncreatedRecordNames: string[] = [];

    for (const domainValidation of certificate.domainValidationOptions) {
      const resourceRecord = domainValidation.resourceRecord;

      if (resourceRecord === undefined) {
        continue;
      }

      if (!dnsRecords.createCname(resourceRecord.name, resourceRecord.value)) {
        uncreatedRecordNames.push(resourceRecord.name);
      }
    }

    return uncreatedRecordNames;
  }
}
