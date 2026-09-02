import {
  copyObjectInput,
  createMultipartUploadInput,
  getObjectInput,
  objectInput,
  putObjectInput,
  putObjectTaggingInput,
  simS3CopySourceHeader,
  versionedObjectInput,
} from "./sim-s3-api-object-input.js";
import {
  completeMultipartUploadInput,
  uploadInput,
  uploadPartInput,
} from "./sim-s3-api-multipart-input.js";
import type { SimS3ApiRoute } from "./sim-s3-api-route.type.js";

/**
 * The Object-level S3 operations this endpoint serves.
 */
export const simS3ObjectApiRoutes: readonly SimS3ApiRoute[] = [
  {
    method: "HEAD",
    target: "object",
    commandName: "HeadObjectCommand",
    input: objectInput,
  },
  {
    method: "GET",
    target: "object",
    commandName: "GetObjectCommand",
    input: getObjectInput,
  },
  {
    method: "GET",
    target: "object",
    subResource: "tagging",
    commandName: "GetObjectTaggingCommand",
    input: versionedObjectInput,
  },
  {
    method: "GET",
    target: "object",
    subResource: "uploadId",
    commandName: "ListPartsCommand",
    input: uploadInput,
  },
  {
    method: "POST",
    target: "object",
    subResource: "uploads",
    commandName: "CreateMultipartUploadCommand",
    input: createMultipartUploadInput,
  },
  {
    method: "POST",
    target: "object",
    subResource: "uploadId",
    commandName: "CompleteMultipartUploadCommand",
    input: completeMultipartUploadInput,
  },
  {
    // Copying an Object into a part of a multipart upload, which simulated S3
    // has no operation for. Named so it is refused rather than read as the
    // part upload it otherwise looks exactly like, which would store an empty
    // part and lose the bytes the copy was moving.
    method: "PUT",
    target: "object",
    subResource: "uploadId",
    header: simS3CopySourceHeader,
    commandName: "UploadPartCopyCommand",
    input: uploadPartInput,
  },
  {
    method: "PUT",
    target: "object",
    subResource: "uploadId",
    commandName: "UploadPartCommand",
    input: uploadPartInput,
  },
  {
    method: "PUT",
    target: "object",
    subResource: "tagging",
    commandName: "PutObjectTaggingCommand",
    input: putObjectTaggingInput,
  },
  {
    // A copy and an upload are both a `PUT` on an Object path, and the copy
    // names its source in a header. Matched first, so an upload carrying no
    // such header still reaches PutObject below.
    method: "PUT",
    target: "object",
    header: simS3CopySourceHeader,
    commandName: "CopyObjectCommand",
    input: copyObjectInput,
  },
  {
    method: "PUT",
    target: "object",
    commandName: "PutObjectCommand",
    input: putObjectInput,
  },
  {
    method: "DELETE",
    target: "object",
    subResource: "tagging",
    commandName: "DeleteObjectTaggingCommand",
    input: versionedObjectInput,
  },
  {
    method: "DELETE",
    target: "object",
    subResource: "uploadId",
    commandName: "AbortMultipartUploadCommand",
    input: uploadInput,
  },
  {
    method: "DELETE",
    target: "object",
    commandName: "DeleteObjectCommand",
    input: objectInput,
  },
];
