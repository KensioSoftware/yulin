import { createHash, createHmac } from "node:crypto";

import { simIamSigV4Algorithm } from "./sim-iam-sigv4-authorization.js";
import type { SimIamSigV4CredentialScope } from "./sim-iam-sigv4-credential-scope.js";

/**
 * Derive the signing key for one secret access key in one scope.
 *
 * The chain is what stops a signature being reusable outside the scope it was
 * made in: the date, Region and service are inputs to the key itself, so a
 * signature for another day or another service cannot be produced without the
 * secret, whatever the request claims.
 */
export function simIamSigV4SigningKey(
  secretAccessKey: string,
  scope: SimIamSigV4CredentialScope,
): Buffer {
  let key = createHmac("sha256", `AWS4${secretAccessKey}`)
    .update(scope.dateStamp)
    .digest();

  for (const part of [scope.regionName, scope.serviceName, "aws4_request"]) {
    key = createHmac("sha256", key).update(part).digest();
  }

  return key;
}

/**
 * Build the string a SigV4 signature is actually computed over.
 *
 * The canonical request is hashed rather than signed directly, so the string to
 * sign is a fixed size whatever the request was.
 */
export function simIamSigV4StringToSign(properties: {
  readonly amzDate: string;
  readonly scope: SimIamSigV4CredentialScope;
  readonly canonicalRequest: string;
}): string {
  return [
    simIamSigV4Algorithm,
    properties.amzDate,
    properties.scope.toString(),
    createHash("sha256").update(properties.canonicalRequest).digest("hex"),
  ].join("\n");
}

/**
 * Sign a string to sign with a derived signing key.
 */
export function simIamSigV4Signature(
  signingKey: Buffer,
  stringToSign: string,
): string {
  return createHmac("sha256", signingKey).update(stringToSign).digest("hex");
}
