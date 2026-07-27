import { SimIamIncompleteSignature } from "./error/sim-iam-sigv4.error.js";
import type { SimIamSigV4CredentialScope } from "./sim-iam-sigv4-credential-scope.js";

const amzDatePattern = /^(?<dateStamp>\d{8})T(?<time>\d{6})Z$/;

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
 * window. A presigned URL is the exception: it states its own lifetime in
 * `X-Amz-Expires`, and that lifetime is enforced, in simulated time.
 */
export function simIamSigV4RequestDate(
  headers: Headers,
  scope: SimIamSigV4CredentialScope,
): string {
  return simIamSigV4CheckedAmzDate(
    headers.get("x-amz-date"),
    scope,
    "X-Amz-Date header",
  );
}

/**
 * Check a signing stamp from wherever the request carried it.
 *
 * A presigned URL states the same value in its query string rather than in a
 * header, so the source is named by the caller and appears in any complaint
 * about the stamp.
 */
export function simIamSigV4CheckedAmzDate(
  amzDate: string | null,
  scope: SimIamSigV4CredentialScope,
  source: string,
): string {
  if (amzDate === null || amzDate.length === 0) {
    throw new SimIamIncompleteSignature(`Signed request carries no ${source}`);
  }

  const dateStamp = amzDatePattern.exec(amzDate)?.groups?.["dateStamp"];

  if (dateStamp === undefined) {
    throw new SimIamIncompleteSignature(
      `${source} ${amzDate} must be an ISO 8601 basic stamp, YYYYMMDDTHHMMSSZ`,
    );
  }

  if (dateStamp !== scope.dateStamp) {
    throw new SimIamIncompleteSignature(
      `${source} ${amzDate} is not on the day its credential scope names, ${
        scope.dateStamp
      }`,
    );
  }

  return amzDate;
}

/**
 * The instant an `X-Amz-Date` stamp names.
 *
 * The stamp is ISO 8601 basic form, which `Date` does not parse, so the
 * separators of the extended form are put back before it is read.
 *
 * The result is checked to name the day and time it was built from. Digits
 * alone do not make a date: `Date` reads 24:60:00 as no instant at all, and
 * quietly rolls February 30th forward into March, which would give a presigned
 * URL a window nothing signed. Both are refused rather than honoured.
 */
export function simIamSigV4SignedAt(amzDate: string): Date {
  const parts = amzDatePattern.exec(amzDate)?.groups;

  /* v8 ignore if -- a stamp is always checked before it is read */
  if (parts === undefined) {
    throw new SimIamIncompleteSignature(
      `X-Amz-Date ${amzDate} is not an ISO 8601 basic stamp`,
    );
  }

  const dateStamp = String(parts["dateStamp"]);
  const time = String(parts["time"]);
  const date = [
    dateStamp.slice(0, 4),
    dateStamp.slice(4, 6),
    dateStamp.slice(6, 8),
  ].join("-");
  const clockTime = [time.slice(0, 2), time.slice(2, 4), time.slice(4, 6)].join(
    ":",
  );
  const signedAt = new Date(`${date}T${clockTime}Z`);

  if (
    Number.isNaN(signedAt.getTime()) ||
    signedAt.toISOString() !== `${date}T${clockTime}.000Z`
  ) {
    throw new SimIamIncompleteSignature(
      `X-Amz-Date ${amzDate} is not a real instant: there is no ` +
        `${clockTime} on ${date}`,
    );
  }

  return signedAt;
}
