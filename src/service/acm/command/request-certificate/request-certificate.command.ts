import type { SimArn } from "../../../aws/arn.js";
import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimAcmValidationMethod } from "../../certificate/sim-acm-domain-validation.js";

/**
 * Minimal structural sim ACM RequestCertificate command.
 */
export interface SimRequestCertificateCommand {
  readonly input: SimRequestCertificateCommandInput;
}

/**
 * Minimal structural sim ACM RequestCertificate input.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/RequestCertificateCommand/
 */
export interface SimRequestCertificateCommandInput {
  readonly DomainName?: string | undefined;
  readonly SubjectAlternativeNames?: readonly string[] | undefined;
  readonly ValidationMethod?: SimAcmValidationMethod | undefined;
  readonly DomainValidationOptions?:
    | readonly SimRequestCertificateDomainValidationOption[]
    | undefined;
  readonly Tags?: readonly SimRequestCertificateTag[] | undefined;
}

/**
 * Minimal structural sim ACM domain validation option input.
 */
export interface SimRequestCertificateDomainValidationOption {
  readonly DomainName?: string | undefined;
  readonly ValidationDomain?: string | undefined;
}

/**
 * Minimal structural sim ACM tag input.
 */
export interface SimRequestCertificateTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim ACM RequestCertificate output.
 */
export interface SimRequestCertificateCommandOutput {
  readonly CertificateArn?: SimArn | undefined;
  readonly $metadata: SimResponseMetadata;
}
