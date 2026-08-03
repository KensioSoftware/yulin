/**
 * The structural command and output types of every simulated S3 operation.
 *
 * Collected here so the service facade and its command handlers can name them
 * in one import each, rather than repeating a per-command import list.
 */

export type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./create-bucket/create-bucket.command.js";
export type {
  SimDeleteBucketPolicyCommand,
  SimDeleteBucketPolicyCommandOutput,
} from "./delete-bucket-policy/delete-bucket-policy.command.js";
export type {
  SimDeleteObjectCommand,
  SimDeleteObjectCommandOutput,
} from "./delete-object/delete-object.command.js";
export type {
  SimDeleteObjectsCommand,
  SimDeleteObjectsCommandOutput,
} from "./delete-objects/delete-objects.command.js";
export type {
  SimDeletePublicAccessBlockCommand,
  SimDeletePublicAccessBlockCommandOutput,
} from "./delete-public-access-block/delete-public-access-block.command.js";
export type {
  SimGetBucketPolicyCommand,
  SimGetBucketPolicyCommandOutput,
} from "./get-bucket-policy/get-bucket-policy.command.js";
export type {
  SimGetObjectCommand,
  SimGetObjectCommandOutput,
} from "./get-object/get-object.command.js";
export type {
  SimGetPublicAccessBlockCommand,
  SimGetPublicAccessBlockCommandOutput,
} from "./get-public-access-block/get-public-access-block.command.js";
export type {
  SimListBucketsCommand,
  SimListBucketsCommandOutput,
} from "./list-buckets/list-buckets.command.js";
export type {
  SimListObjectsCommand,
  SimListObjectsCommandOutput,
} from "./list-objects/list-objects.command.js";
export type {
  SimPutBucketPolicyCommand,
  SimPutBucketPolicyCommandOutput,
} from "./put-bucket-policy/put-bucket-policy.command.js";
export type {
  SimPutBucketWebsiteCommand,
  SimPutBucketWebsiteCommandOutput,
} from "./put-bucket-website/put-bucket-website.command.js";
export type {
  SimPutObjectCommand,
  SimPutObjectCommandOutput,
} from "./put-object/put-object.command.js";
export type {
  SimPutPublicAccessBlockCommand,
  SimPutPublicAccessBlockCommandOutput,
} from "./put-public-access-block/put-public-access-block.command.js";
