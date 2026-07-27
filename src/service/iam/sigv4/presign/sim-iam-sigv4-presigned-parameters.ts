import { SimIamIncompleteSignature } from "../error/sim-iam-sigv4.error.js";

/**
 * The query parameters a presigned URL states its signature in.
 *
 * Names are matched without regard to case, as the canonical query builder
 * already excludes the signature parameter without regard to case. Signers
 * emit the `X-Amz-` spelling, and nothing is gained by refusing a client that
 * lower-cases them on the way.
 */
export const simIamSigV4PresignedParameters = {
  algorithm: "x-amz-algorithm",
  credential: "x-amz-credential",
  date: "x-amz-date",
  expires: "x-amz-expires",
  signedHeaders: "x-amz-signedheaders",
  signature: "x-amz-signature",
  securityToken: "x-amz-security-token",
  contentSha256: "x-amz-content-sha256",
} as const;

/**
 * Read a parameter the signature cannot be rebuilt without.
 */
export function simIamSigV4RequiredPresignedParameter(
  url: URL,
  name: string,
): string {
  const value = simIamSigV4PresignedParameter(url, name);

  if (value === undefined || value.length === 0) {
    throw new SimIamIncompleteSignature(
      `Presigned URL is missing its ${name} parameter`,
    );
  }

  return value;
}

/**
 * Read one presigned parameter from a URL, whatever case it was written in.
 */
export function simIamSigV4PresignedParameter(
  url: URL,
  name: string,
): string | undefined {
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === name) {
      return value;
    }
  }

  return undefined;
}
