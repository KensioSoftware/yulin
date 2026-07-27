import type { SimIamSigV4CredentialScope } from "./sim-iam-sigv4-credential-scope.js";

/**
 * What a request states about the signature it carries.
 *
 * SigV4 offers the same facts in two places: an `Authorization` header, or the
 * query string of a presigned URL. Everything downstream of parsing needs only
 * these four, so verification is written against this rather than against
 * either form, and the two differ only in how they are read off the request.
 */
export interface SimIamSigV4SignatureStatement {
  readonly accessKeyId: string;
  readonly scope: SimIamSigV4CredentialScope;
  readonly signedHeaderNames: readonly string[];
  readonly signature: string;
}
