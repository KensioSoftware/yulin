import { objectInput, putObjectInput } from "./sim-s3-api-input.js";
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
    input: objectInput,
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
    commandName: "DeleteObjectCommand",
    input: objectInput,
  },
];
