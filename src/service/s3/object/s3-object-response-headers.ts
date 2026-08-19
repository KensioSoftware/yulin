import { simS3SystemMetadataHeaders } from "./s3-system-metadata.js";

/**
 * What an endpoint knows about the Object it is about to serve.
 */
export interface SimS3ObjectResponseDescription {
  /** The system metadata S3 was told when the Object was written. */
  readonly metadata?: Readonly<Record<string, string>> | undefined;
  /** The length of the body being served, in bytes. */
  readonly bodyLength: number;
  /** The Object's ETag, quoted as an HTTP entity tag. */
  readonly etag?: string | undefined;
  /** When S3 last wrote the Object. */
  readonly lastModified?: Date | undefined;
  /**
   * Which bytes of the Object are being served, for a read that asked for some
   * of them rather than all of them.
   */
  readonly contentRange?: string | undefined;
}

/**
 * The headers S3 sets on a read from what it was told when the Object was
 * written.
 *
 * S3 keeps the metadata ones as Object system metadata and hands them straight
 * back, unchanged, on every read. That matters most for `Content-Encoding`: an
 * Object stored as brotli and served without its encoding header is bytes no
 * client can decode. `Cache-Control` matters for a different reason, being the
 * only one of these a caller can set per Object rather than per response.
 *
 * `ETag` and `Last-Modified` are not metadata but facts about the stored bytes,
 * and are what makes a conditional request or a content-hash comparison
 * possible over HTTP. `Content-Range` is a fact about the response rather than
 * the Object. It says which of the Object's bytes the ones being sent are.
 *
 * Every path that serves an Object goes through here, so they agree on what
 * reading one looks like.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html
 */
export function simS3ObjectResponseHeaders(
  description: SimS3ObjectResponseDescription,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-length": String(description.bodyLength),
  };

  for (const header of simS3SystemMetadataHeaders) {
    const value = description.metadata?.[header.name];

    if (value !== undefined) {
      headers[header.name] = value;
    }
  }

  if (description.etag !== undefined) {
    headers["etag"] = description.etag;
  }

  if (description.lastModified !== undefined) {
    headers["last-modified"] = description.lastModified.toUTCString();
  }

  if (description.contentRange !== undefined) {
    headers["content-range"] = description.contentRange;
  }

  return headers;
}
