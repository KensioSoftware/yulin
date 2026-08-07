import { simS3SystemMetadataHeaders } from "./s3-system-metadata.js";

/**
 * The headers S3 sets on a read from what it was told when the Object was
 * written.
 *
 * S3 keeps these as Object system metadata and hands them straight back,
 * unchanged, on every read. That matters most for `Content-Encoding`: an Object
 * stored as brotli and served without its encoding header is bytes no client
 * can decode. `Cache-Control` matters for a different reason, being the only
 * one of these a caller can set per Object rather than per response.
 *
 * Every path that serves an Object goes through here, so they agree on what
 * reading one looks like.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html
 */
export function simS3ObjectResponseHeaders(
  metadata: Readonly<Record<string, string>> | undefined,
  bodyLength: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-length": String(bodyLength),
  };

  for (const header of simS3SystemMetadataHeaders) {
    const value = metadata?.[header.name];

    if (value !== undefined) {
      headers[header.name] = value;
    }
  }

  return headers;
}
