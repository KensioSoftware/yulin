import { optional, simS3UserMetadata } from "./sim-s3-api-input.js";
import type { SimS3ApiRequest } from "./sim-s3-api-request.js";

/**
 * Reading the Object operations' inputs out of a request.
 *
 * S3 puts an Object's key in the path and everything said about its bytes in
 * the headers, so these read the two together where a Bucket operation reads
 * the query string or the body.
 */

/**
 * The header real S3 states a copy in, which is what separates a copy from the
 * upload it shares a method and a path with.
 */
export const simS3CopySourceHeader = "x-amz-copy-source";

/**
 * The input of an operation naming one Object.
 */
export function objectInput(request: SimS3ApiRequest): object {
  return { Bucket: request.bucketName, Key: request.objectKey };
}

/**
 * The input of a read, which can ask for part of an Object.
 */
export function getObjectInput(request: SimS3ApiRequest): object {
  return {
    ...objectInput(request),
    ...optional("Range", request.headers.get("range")),
  };
}

/**
 * The input of an upload, which carries its bytes and the headers describing
 * them.
 */
export function putObjectInput(request: SimS3ApiRequest): object {
  return { ...createMultipartUploadInput(request), Body: request.body };
}

/**
 * The input of a copy, which names its source in a header and carries no bytes
 * of its own.
 *
 * The source is passed on as it arrived, percent-encoding and all, because the
 * operation decodes it a key segment at a time the way the endpoint decodes a
 * key out of a request path.
 */
export function copyObjectInput(request: SimS3ApiRequest): object {
  return {
    ...createMultipartUploadInput(request),
    ...optional("CopySource", request.headers.get(simS3CopySourceHeader)),
    ...optional(
      "MetadataDirective",
      request.headers.get("x-amz-metadata-directive"),
    ),
  };
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
    ...optional("StorageClass", request.headers.get("x-amz-storage-class")),
    ...optional(
      "ServerSideEncryption",
      request.headers.get("x-amz-server-side-encryption"),
    ),
    ...simS3UserMetadata(request.headers),
  };
}
