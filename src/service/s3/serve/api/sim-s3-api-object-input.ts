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
