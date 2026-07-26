import { SimIamIncompleteSignature } from "./error/sim-iam-sigv4.error.js";
import type { SimIamSigV4CredentialScope } from "./sim-iam-sigv4-credential-scope.js";

const amzDatePattern = /^(?<dateStamp>\d{8})T\d{6}Z$/;

/**
 * Read the `X-Amz-Date` a request was signed at.
 *
 * The stamp is required, has to be well formed, and has to agree with the date
 * in the credential scope, because both feed the signature and a signer that
 * disagrees with itself cannot have produced one.
 *
 * It is deliberately never compared to a clock. Rejecting an old signature
 * would buy nothing a caller could assert on, and would break every client that
 * stamps real time and has no way to know what time this simulation is keeping.
 * This is a documented divergence from real AWS, which enforces a five minute
 * window.
 */
export function simIamSigV4RequestDate(
  headers: Headers,
  scope: SimIamSigV4CredentialScope,
): string {
  const amzDate = headers.get("x-amz-date");

  if (amzDate === null || amzDate.length === 0) {
    throw new SimIamIncompleteSignature(
      "Signed request carries no X-Amz-Date header",
    );
  }

  const dateStamp = amzDatePattern.exec(amzDate)?.groups?.["dateStamp"];

  if (dateStamp === undefined) {
    throw new SimIamIncompleteSignature(
      `X-Amz-Date ${amzDate} must be an ISO 8601 basic stamp, ` +
        `YYYYMMDDTHHMMSSZ`,
    );
  }

  if (dateStamp !== scope.dateStamp) {
    throw new SimIamIncompleteSignature(
      `X-Amz-Date ${amzDate} is not on the day its credential scope names, ${
        scope.dateStamp
      }`,
    );
  }

  return amzDate;
}
