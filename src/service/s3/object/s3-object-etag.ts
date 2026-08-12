import { createHash } from "node:crypto";

/**
 * The ETag real S3 gives an Object uploaded in one part.
 *
 * It is the MD5 of the bytes, in hex, and stays that under SSE-S3. An Object
 * uploaded in several parts gets `<md5-of-the-part-md5s>-<partCount>` instead,
 * which is why a tool comparing content hashes checks for the `-N` suffix
 * before trusting an ETag. Simulated S3 has no multipart upload, so an ETag
 * here never carries one.
 */
export function simS3ObjectETag(body: Buffer): string {
  return createHash("md5").update(body).digest("hex");
}

/**
 * The ETag as a response carries it, which real S3 quotes.
 *
 * S3 is inconsistent about this, and deliberately so: on the wire an ETag is an
 * HTTP entity tag and keeps its quotes, which the SDK hands to the caller
 * unchanged, while the `eTag` of an Object event notification record does not.
 * Holding the digest and quoting it on the way out keeps both of them right.
 */
export function simS3QuotedETag(etag: string): string {
  return `"${etag}"`;
}
