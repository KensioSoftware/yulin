import type { SimS3ApiRequest } from "./sim-s3-api-request.js";

/**
 * The input of an operation naming only a Bucket, which most of them are.
 */
export function bucketInput(request: SimS3ApiRequest): object {
  return { Bucket: request.bucketName };
}

/**
 * The input of an operation naming one Object.
 */
export function objectInput(request: SimS3ApiRequest): object {
  return { Bucket: request.bucketName, Key: request.objectKey };
}

/**
 * The input of an operation that names a Bucket and reads its body into one
 * member, which every configuration write does.
 */
export function bucketBodyInput<T>(
  request: SimS3ApiRequest,
  member: string,
  read: (body: string) => T,
): object {
  return { Bucket: request.bucketName, [member]: read(utf8(request.body)) };
}

/**
 * The input of an upload, which carries its bytes and the headers describing
 * them.
 */
export function putObjectInput(request: SimS3ApiRequest): object {
  return { ...createMultipartUploadInput(request), Body: request.body };
}

/**
 * The input of a request that describes an Object without carrying its bytes,
 * which is what starting a multipart upload is.
 */
export function createMultipartUploadInput(request: SimS3ApiRequest): object {
  return {
    Bucket: request.bucketName,
    Key: request.objectKey,
    ...optional("ContentType", request.headers.get("content-type")),
    ...optional("CacheControl", request.headers.get("cache-control")),
    ...optional(
      "ContentDisposition",
      request.headers.get("content-disposition"),
    ),
    ...optional("ContentEncoding", request.headers.get("content-encoding")),
    ...optional("ContentLanguage", request.headers.get("content-language")),
    ...simS3UserMetadata(request.headers),
  };
}

/**
 * Reading the members of an S3 operation input out of a request.
 *
 * S3 spreads an input across the query string, the headers and the body, so
 * each of these takes the one part of a request its operation reads.
 */

/**
 * The ListBuckets input, which pages by continuation token.
 */
export function listBucketsInput(request: SimS3ApiRequest): object {
  return {
    ...optional("Prefix", request.query.get("prefix")),
    ...optional("ContinuationToken", request.query.get("continuation-token")),
    ...optionalNumber("MaxBuckets", request.query.get("max-buckets")),
  };
}

/**
 * The ListObjectsV2 input, which pages by continuation token.
 */
export function listObjectsV2Input(request: SimS3ApiRequest): object {
  return {
    Bucket: request.bucketName,
    ...optional("Prefix", request.query.get("prefix")),
    ...optional("ContinuationToken", request.query.get("continuation-token")),
    ...optional("StartAfter", request.query.get("start-after")),
    ...optionalNumber("MaxKeys", request.query.get("max-keys")),
  };
}

/**
 * The first ListObjects input, which pages by marker.
 */
export function listObjectsInput(request: SimS3ApiRequest): object {
  return {
    Bucket: request.bucketName,
    ...optional("Prefix", request.query.get("prefix")),
    ...optional("Marker", request.query.get("marker")),
    ...optionalNumber("MaxKeys", request.query.get("max-keys")),
  };
}

/**
 * The user metadata an upload carried, which S3 sends as `x-amz-meta-` headers.
 */
export function simS3UserMetadata(headers: Headers): {
  Metadata?: Record<string, string>;
} {
  const prefix = "x-amz-meta-";
  const metadata: Record<string, string> = {};

  for (const [name, value] of headers) {
    if (name.toLowerCase().startsWith(prefix)) {
      metadata[name.slice(prefix.length).toLowerCase()] = value;
    }
  }

  return Object.keys(metadata).length === 0 ? {} : { Metadata: metadata };
}

/**
 * Include a member only when the request stated it, since an operation treats
 * an absent member and an empty one differently.
 */
export function optional(
  name: string,
  value: string | null,
): Record<string, string> {
  return value === null ? {} : { [name]: value };
}

/**
 * The numeric form of the same, dropping a value that is not a number.
 */
export function optionalNumber(
  name: string,
  value: string | null,
): Record<string, number> {
  if (value === null) {
    return {};
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? { [name]: parsed } : {};
}

/**
 * Read a request body as the text it carries.
 */
export function utf8(body: Uint8Array): string {
  return Buffer.from(body).toString("utf8");
}
