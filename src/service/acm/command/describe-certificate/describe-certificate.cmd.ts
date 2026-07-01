import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimAcmCertificateStatus,
  SimAcmValidationMethod,
} from "../../certificate/sim-acm-certificate.js";

/**
 * Minimal structural sim ACM DescribeCertificate command.
 */
export interface SimDescribeCertificateCommand {
  readonly input: SimDescribeCertificateCommandInput;
}

/**
 * Minimal structural sim ACM DescribeCertificate input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/DescribeCertificateCommand/
 */
export interface SimDescribeCertificateCommandInput {
  readonly CertificateArn?: SimArn | undefined;
}

/**
 * Minimal structural sim ACM DescribeCertificate output.
 */
export interface SimDescribeCertificateCommandOutput {
  readonly Certificate?: SimAcmCertificateDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ACM CertificateDetail.
 */
export interface SimAcmCertificateDetail {
  readonly CertificateArn?: SimArn | undefined;
  readonly DomainName?: string | undefined;
  readonly SubjectAlternativeNames?: readonly string[] | undefined;
  readonly Status?: SimAcmCertificateStatus | undefined;
  readonly Type?: "AMAZON_ISSUED" | undefined;
  readonly KeyAlgorithm?: "RSA-2048" | undefined;
  readonly SignatureAlgorithm?: "SHA256WITHRSA" | undefined;
  readonly InUseBy?: readonly string[] | undefined;
  readonly CreatedAt?: Date | undefined;
  readonly IssuedAt?: Date | undefined;
  readonly DomainValidationOptions?:
    readonly SimAcmCertificateDomainValidation[] | undefined;
}

/**
 * Minimal structural sim ACM DomainValidation.
 */
export interface SimAcmCertificateDomainValidation {
  readonly DomainName?: string | undefined;
  readonly ValidationMethod?: SimAcmValidationMethod | undefined;
  readonly ValidationStatus?: SimAcmCertificateStatus | undefined;
  readonly ResourceRecord?: SimAcmCertificateResourceRecord | undefined;
}

/**
 * Minimal structural sim ACM ResourceRecord.
 */
export interface SimAcmCertificateResourceRecord {
  readonly Name?: string | undefined;
  readonly Type?: "CNAME" | undefined;
  readonly Value?: string | undefined;
}
