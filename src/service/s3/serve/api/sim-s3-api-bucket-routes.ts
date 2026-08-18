import { readSimS3NotificationConfiguration } from "./sim-s3-api-notification-read.js";
import {
  readSimS3DeleteRequest,
  readSimS3PublicAccessBlock,
  readSimS3WebsiteConfiguration,
} from "./sim-s3-api-xml-read.js";
import {
  bucketBodyInput,
  bucketInput,
  listBucketsInput,
  listObjectsInput,
  listObjectsV2Input,
} from "./sim-s3-api-input.js";
import { listMultipartUploadsInput } from "./sim-s3-api-multipart-input.js";
import type { SimS3ApiRoute } from "./sim-s3-api-route.type.js";

/**
 * The service-level and Bucket-level S3 operations this endpoint serves.
 *
 * A route naming a sub-resource is matched before the plain one for the same
 * method and path, which is the only ordering that matters here.
 */
export const simS3BucketApiRoutes: readonly SimS3ApiRoute[] = [
  {
    method: "HEAD",
    target: "bucket",
    commandName: "HeadBucketCommand",
    input: bucketInput,
  },
  {
    method: "GET",
    target: "service",
    commandName: "ListBucketsCommand",
    input: listBucketsInput,
  },
  {
    method: "GET",
    target: "bucket",
    subResource: "policy",
    commandName: "GetBucketPolicyCommand",
    input: bucketInput,
  },
  {
    method: "GET",
    target: "bucket",
    subResource: "publicAccessBlock",
    commandName: "GetPublicAccessBlockCommand",
    input: bucketInput,
  },
  {
    method: "GET",
    target: "bucket",
    subResource: "notification",
    commandName: "GetBucketNotificationConfigurationCommand",
    input: bucketInput,
  },
  {
    method: "GET",
    target: "bucket",
    subResource: "uploads",
    commandName: "ListMultipartUploadsCommand",
    input: listMultipartUploadsInput,
  },
  {
    method: "GET",
    target: "bucket",
    matches: (query) => query.get("list-type") === "2",
    commandName: "ListObjectsV2Command",
    input: (request) => listObjectsV2Input(request),
  },
  {
    method: "GET",
    target: "bucket",
    commandName: "ListObjectsCommand",
    input: (request) => listObjectsInput(request),
  },
  {
    method: "PUT",
    target: "bucket",
    subResource: "policy",
    commandName: "PutBucketPolicyCommand",
    // A Bucket policy is a JSON document, which travels as the body itself.
    input: (request) => bucketBodyInput(request, "Policy", (body) => body),
  },
  {
    method: "PUT",
    target: "bucket",
    subResource: "website",
    commandName: "PutBucketWebsiteCommand",
    input: (request) =>
      bucketBodyInput(
        request,
        "WebsiteConfiguration",
        readSimS3WebsiteConfiguration,
      ),
  },
  {
    method: "PUT",
    target: "bucket",
    subResource: "publicAccessBlock",
    commandName: "PutPublicAccessBlockCommand",
    input: (request) =>
      bucketBodyInput(
        request,
        "PublicAccessBlockConfiguration",
        readSimS3PublicAccessBlock,
      ),
  },
  {
    method: "PUT",
    target: "bucket",
    subResource: "notification",
    commandName: "PutBucketNotificationConfigurationCommand",
    input: (request) =>
      bucketBodyInput(
        request,
        "NotificationConfiguration",
        readSimS3NotificationConfiguration,
      ),
  },
  {
    method: "PUT",
    target: "bucket",
    commandName: "CreateBucketCommand",
    input: bucketInput,
  },
  {
    method: "POST",
    target: "bucket",
    subResource: "delete",
    commandName: "DeleteObjectsCommand",
    input: (request) =>
      bucketBodyInput(request, "Delete", readSimS3DeleteRequest),
  },
  {
    method: "DELETE",
    target: "bucket",
    subResource: "policy",
    commandName: "DeleteBucketPolicyCommand",
    input: bucketInput,
  },
  {
    method: "DELETE",
    target: "bucket",
    subResource: "publicAccessBlock",
    commandName: "DeletePublicAccessBlockCommand",
    input: bucketInput,
  },
  {
    method: "DELETE",
    target: "bucket",
    commandName: "DeleteBucketCommand",
    input: bucketInput,
  },
];
