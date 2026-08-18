import { optional, optionalNumber } from "./sim-s3-api-input.js";
import type { SimS3ApiRequest } from "./sim-s3-api-request.js";
import { readSimS3CompletedUpload } from "./sim-s3-api-xml-read.js";

/**
 * Reading the multipart upload operations' inputs out of a request.
 *
 * S3 states which upload a request belongs to in the `uploadId` query
 * parameter, and which part in `partNumber`, so all six read the query string
 * where the single-part operations read only the path.
 */

/**
 * The input of an operation naming one upload in progress.
 */
export function uploadInput(request: SimS3ApiRequest): object {
  return {
    Bucket: request.bucketName,
    Key: request.objectKey,
    UploadId: request.query.get("uploadId") ?? "",
  };
}

/**
 * The UploadPart input, which carries one part's bytes and its number.
 */
export function uploadPartInput(request: SimS3ApiRequest): object {
  return {
    ...uploadInput(request),
    Body: request.body,
    ...optionalNumber("PartNumber", request.query.get("partNumber")),
  };
}

/**
 * The CompleteMultipartUpload input, which names the parts to join in its body.
 */
export function completeMultipartUploadInput(request: SimS3ApiRequest): object {
  return {
    ...uploadInput(request),
    MultipartUpload: readSimS3CompletedUpload(request.body),
  };
}

/**
 * The ListMultipartUploads input, which names a Bucket rather than an Object.
 */
export function listMultipartUploadsInput(request: SimS3ApiRequest): object {
  return {
    Bucket: request.bucketName,
    ...optional("Prefix", request.query.get("prefix")),
  };
}
