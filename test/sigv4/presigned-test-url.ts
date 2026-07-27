/**
 * Builds the presigned URL the presign tests start from, so each of them can
 * break one thing about it. It lives here because two test files share it, and
 * a module that both exports helpers and declares tests is not allowed.
 *
 * The signature is not a real one: these tests are about reading what a URL
 * states, not about whether it states the truth, which the tests that presign
 * with the real AWS SDK settle instead.
 */

import { exampleAccessKeyId } from "./sim-signer.js";

export const presignedTestSignedAt = "20260727T120000Z";

const defaults: Record<string, string> = {
  "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
  "X-Amz-Credential": `${exampleAccessKeyId}/20260727/eu-west-2/s3/aws4_request`,
  "X-Amz-Date": presignedTestSignedAt,
  "X-Amz-Expires": "900",
  "X-Amz-SignedHeaders": "host",
  "X-Amz-Signature": "a".repeat(64),
};

/**
 * A well formed presigned URL, with any parameter overridden or, when the
 * override is undefined, left out.
 */
export function presignedTestUrl(
  overrides: Record<string, string | undefined> = {},
): URL {
  const url = new URL("http://reports.s3.eu-west-2.sim-aws.localhost/q3.pdf");
  const parameters = Object.entries({ ...defaults, ...overrides });

  for (const [name, value] of parameters) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }

  return url;
}
