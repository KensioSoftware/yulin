import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim ACM DeleteCertificate command.
 */
export interface SimDeleteCertificateCommand {
  readonly input: SimDeleteCertificateCommandInput;
}

/**
 * Minimal structural sim ACM DeleteCertificate input.
 */
export interface SimDeleteCertificateCommandInput {
  readonly CertificateArn?: string | undefined;
}

/**
 * Minimal structural sim ACM DeleteCertificate output.
 *
 * Real ACM answers a successful DeleteCertificate with an empty body.
 */
export interface SimDeleteCertificateCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
