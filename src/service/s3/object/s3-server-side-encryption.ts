import { SimS3InvalidArgument } from "../error/sim-s3.error.js";

/**
 * The server-side encryption algorithms S3 applies to an Object.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html
 */
export const simS3ServerSideEncryptionAlgorithms = [
  "AES256",
  "aws:kms",
  "aws:kms:dsse",
] as const;

/**
 * One server-side encryption algorithm.
 */
export type SimS3ServerSideEncryption =
  (typeof simS3ServerSideEncryptionAlgorithms)[number];

/**
 * The encryption every Bucket applies to an Object whose write named none.
 *
 * Real S3 has encrypted every new Object with SSE-S3 since January 2023, and
 * reports `AES256` for one written into a Bucket carrying no default of its
 * own. Nothing is encrypted here. The bytes are stored as they arrive, and this
 * is what a read says about them.
 */
export const simS3DefaultServerSideEncryption: SimS3ServerSideEncryption =
  "AES256";

/**
 * Read the encryption a request or a Bucket configuration named, refusing an
 * algorithm S3 does not apply.
 *
 * Real S3 answers `InvalidArgument` for an unsupported algorithm on a write.
 */
export function simS3ServerSideEncryptionFrom(
  value: string | undefined,
  context: string,
): SimS3ServerSideEncryption | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isSimS3ServerSideEncryption(value)) {
    throw new SimS3InvalidArgument(
      `${value} is not a server-side encryption algorithm for ${context}. ` +
        `It is one of ${simS3ServerSideEncryptionAlgorithms.join(", ")}.`,
    );
  }

  return value;
}

/**
 * Whether a value names a server-side encryption algorithm.
 */
export function isSimS3ServerSideEncryption(
  value: string,
): value is SimS3ServerSideEncryption {
  return (simS3ServerSideEncryptionAlgorithms as readonly string[]).includes(
    value,
  );
}
