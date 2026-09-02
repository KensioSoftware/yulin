import {
  simS3SystemMetadataHeaders,
  simS3UserMetadataPrefix,
} from "./s3-system-metadata.js";

/**
 * What an endpoint knows about the Object it is about to serve.
 */
export interface SimS3ObjectResponseDescription {
  /** The system metadata S3 was told when the Object was written. */
  readonly metadata?: Readonly<Record<string, string>> | undefined;
  /**
   * The metadata the caller attached to the Object, under the keys it used
   * rather than the prefixed names the headers carry.
   */
  readonly userMetadata?: Readonly<Record<string, string>> | undefined;
  /**
   * The headers the read asked to be served in place of the Object's own,
   * under the same names, from its `response-` parameters.
   */
  readonly overrides?: Readonly<Record<string, string>> | undefined;
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
  /**
   * The storage class the Object is in, for one outside the default class.
   * Real S3 leaves the header off a Standard Object.
   */
  readonly storageClass?: string | undefined;
  /** The encryption S3 applied when it stored the Object. */
  readonly serverSideEncryption?: string | undefined;
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
 * `x-amz-storage-class` and `x-amz-server-side-encryption` say where and how
 * S3 keeps the Object. The class is set for an Object outside the default one,
 * as real S3 sets it, and the encryption is set for every Object S3 stored
 * itself.
 *
 * User-defined metadata goes back out under the `x-amz-meta-` prefix S3 sends
 * it with, one header per entry. The prefix is what keeps a caller's own key
 * apart from a header S3 sets itself, so an Object holding a `content-type`
 * key is served an `x-amz-meta-content-type` header alongside its own content
 * type rather than in place of it.
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
    const value =
      description.overrides?.[header.name] ??
      description.metadata?.[header.name];

    if (value !== undefined) {
      headers[header.name] = value;
    }
  }

  const userDefined = Object.entries(description.userMetadata ?? {});

  for (const [key, value] of userDefined) {
    headers[`${simS3UserMetadataPrefix}${key}`] = value;
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

  if (description.storageClass !== undefined) {
    headers["x-amz-storage-class"] = description.storageClass;
  }

  if (description.serverSideEncryption !== undefined) {
    headers["x-amz-server-side-encryption"] = description.serverSideEncryption;
  }

  return headers;
}

/**
 * The prefix a read overrides a response header with.
 */
const responseOverridePrefix = "response-";

/**
 * The response headers a read asked to be served in place of the Object's own.
 *
 * Real S3 has one of these per system metadata header, named after it, so they
 * are read by the same list rather than spelled out again. `Content-Type` and
 * `Content-Disposition` are the two worth having: a presigned URL naming them
 * decides whether the browser opens the file or saves it, and under what name,
 * without anything being written to the Object.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
 */
export function simS3ResponseHeaderOverrides(
  query: URLSearchParams,
): Record<string, string> {
  const overrides: Record<string, string> = {};

  for (const header of simS3SystemMetadataHeaders) {
    const value = query.get(`${responseOverridePrefix}${header.name}`);

    if (value !== null) {
      overrides[header.name] = value;
    }
  }

  return overrides;
}
