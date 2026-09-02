import { simS3WriteMetadataHeaders } from "../../object/s3-write-metadata.js";
import { optional, utf8 } from "./sim-s3-api-input.js";
import type { SimS3ApiRequest } from "./sim-s3-api-request.js";
import { readSimS3Tagging } from "./sim-s3-api-tagging-read.js";

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
 * The input of an operation naming one Object, or one version of it.
 *
 * Real S3 names the version in the query string alongside the sub-resource, so
 * a request naming none acts on whatever a plain read of the key answers with.
 */
export function versionedObjectInput(request: SimS3ApiRequest): object {
  return {
    ...objectInput(request),
    ...optional("VersionId", request.query.get("versionId")),
  };
}

/**
 * The input of a tagging write, which carries its tag set as a document.
 */
export function putObjectTaggingInput(request: SimS3ApiRequest): object {
  return {
    ...versionedObjectInput(request),
    Tagging: readSimS3Tagging(utf8(request.body)),
  };
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
    ...optional(
      "TaggingDirective",
      request.headers.get("x-amz-tagging-directive"),
    ),
  };
}

/**
 * The input of a request that describes an Object without carrying its bytes,
 * which is what starting a multipart upload is.
 *
 * The metadata headers are read by the list a write and a read share, so an
 * upload over this endpoint describes an Object exactly as a `PutObjectCommand`
 * does. Where S3 keeps the Object and how it encrypts it are read alongside
 * them, being facts about the storage rather than metadata about the Object.
 */
export function createMultipartUploadInput(request: SimS3ApiRequest): object {
  return {
    Bucket: request.bucketName,
    Key: request.objectKey,
    ...simS3WriteMetadataHeaders(request.headers),
    ...optional("StorageClass", request.headers.get("x-amz-storage-class")),
    ...optional("Tagging", request.headers.get("x-amz-tagging")),
    ...optional(
      "ServerSideEncryption",
      request.headers.get("x-amz-server-side-encryption"),
    ),
  };
}
