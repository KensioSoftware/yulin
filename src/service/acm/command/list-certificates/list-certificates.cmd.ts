import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimAcmCertificateStatus } from "../../certificate/sim-acm-certificate.js";

/**
 * Minimal structural sim ACM ListCertificates command.
 */
export interface SimListCertificatesCommand {
  readonly input: SimListCertificatesCommandInput;
}

/**
 * Minimal structural sim ACM ListCertificates input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/ListCertificatesCommand/
 */
export interface SimListCertificatesCommandInput {
  readonly CertificateStatuses?: readonly SimAcmCertificateStatus[] | undefined;
  readonly MaxItems?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * Minimal structural sim ACM ListCertificates output.
 */
export interface SimListCertificatesCommandOutput {
  readonly CertificateSummaryList?:
    readonly SimAcmCertificateSummary[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ACM CertificateSummary.
 */
export interface SimAcmCertificateSummary {
  readonly CertificateArn?: SimArn | undefined;
  readonly DomainName?: string | undefined;
  readonly SubjectAlternativeNameSummaries?: readonly string[] | undefined;
  readonly HasAdditionalSubjectAlternativeNames?: boolean | undefined;
  readonly Status?: SimAcmCertificateStatus | undefined;
  readonly Type?: "TEST_ISSUED" | undefined;
  readonly KeyAlgorithm?: "RSA-2048" | undefined;
  readonly InUse?: boolean | undefined;
  readonly CreatedAt?: Date | undefined;
  readonly IssuedAt?: Date | undefined;
}
