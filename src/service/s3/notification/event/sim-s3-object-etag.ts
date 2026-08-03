import { createHash } from "node:crypto";

/**
 * The ETag real S3 gives an Object uploaded in one part.
 *
 * It is the MD5 of the bytes, in hex. An Object uploaded in several parts gets
 * a different form, which simulated S3 has no multipart upload to produce.
 */
export function simS3ObjectETag(body: Buffer): string {
  return createHash("md5").update(body).digest("hex");
}
