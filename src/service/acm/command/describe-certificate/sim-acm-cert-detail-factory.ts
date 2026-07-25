import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import type { SimAcmCertificateDetail } from "./describe-certificate.command.js";

/**
 * Builds ACM DescribeCertificate certificate detail payloads.
 *
 * This class owns the translation from the simulator's internal certificate
 * model to the public DescribeCertificate response shape. Keeping that
 * translation out of the command handler lets the handler stay focused on
 * command validation, background sequencing, lookup, and error handling.
 */
export class SimAcmCertificateDetailFactory {
  /**
   * Convert one simulated ACM certificate into the structure returned as
   * DescribeCertificateCommandOutput.Certificate.
   *
   * The simulator stores certificate data in camelCase fields, while the AWS
   * SDK response uses PascalCase member names. This method is the boundary
   * where those naming conventions are translated.
   */
  make(certificate: SimAcmCertificate): SimAcmCertificateDetail {
    return {
      CertificateArn: certificate.certificateArn,
      DomainName: certificate.domainName,
      SubjectAlternativeNames: certificate.subjectAlternativeNames,
      Status: certificate.status,
      Type: "AMAZON_ISSUED",
      KeyAlgorithm: "RSA-2048",
      SignatureAlgorithm: "SHA256WITHRSA",
      InUseBy: [],
      CreatedAt: certificate.createdAt,
      IssuedAt: certificate.issuedAt,
      DomainValidationOptions: certificate.domainValidationOptions.map(
        (option) => ({
          DomainName: option.domainName,
          ValidationMethod: option.validationMethod,
          ValidationStatus: option.status,
          ResourceRecord:
            option.resourceRecord === undefined
              ? undefined
              : {
                  Name: option.resourceRecord.name,
                  Type: option.resourceRecord.type,
                  Value: option.resourceRecord.value,
                },
        }),
      ),
    };
  }
}
