import {
  createMultipartUploadInput,
  getObjectInput,
  objectInput,
  putObjectInput,
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
    method: "PUT",
    target: "object",
    subResource: "uploadId",
    commandName: "UploadPartCommand",
    input: uploadPartInput,
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
