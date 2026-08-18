import { createHash } from "node:crypto";

/**
 * The ETag real S3 gives an Object uploaded in one part.
 *
 * It is the MD5 of the bytes, in hex, and stays that under SSE-S3. An Object
 * uploaded in several parts gets a different form, which `simS3MultipartETag`
 * below builds.
 */
export function simS3ObjectETag(body: Buffer): string {
  return createHash("md5").update(body).digest("hex");
}

/**
 * The ETag real S3 gives an Object uploaded in parts.
 *
 * It is `<md5-of-the-part-md5s>-<partCount>`, where the digests being hashed
 * are the raw bytes of each part's MD5 rather than their hex spellings. A tool
 * comparing content hashes checks for the `-N` suffix before trusting an ETag,
 * so an Object assembled from parts has to carry this rather than the MD5 of
 * the joined bytes: the two are different values and only one of them is what
 * AWS would have answered.
 */
export function simS3MultipartETag(partETags: readonly string[]): string {
  const digests = Buffer.concat(
    partETags.map((etag) => Buffer.from(etag, "hex")),
  );

  return `${createHash("md5").update(digests).digest("hex")}-${partETags.length}`;
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

/**
 * The digest a quoted ETag carries, for reading one a client sent back.
 *
 * A client returns the ETag it was given, quotes and all, and a comparison
 * against the stored digest has to be against the same form.
 */
export function simS3UnquotedETag(etag: string): string {
  return etag.replaceAll('"', "");
}
