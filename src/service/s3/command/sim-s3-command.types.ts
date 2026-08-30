/**
 * The structural command and output types of every simulated S3 operation.
 *
 * Collected here so the service facade and its command handlers can name them
 * in one import each, rather than repeating a per-command import list.
 */

export type {
  SimHeadBucketCommand,
  SimHeadBucketCommandInput,
  SimHeadBucketCommandOutput,
} from "./head-bucket/head-bucket.command.js";
export type {
  SimHeadObjectCommand,
  SimHeadObjectCommandInput,
  SimHeadObjectCommandOutput,
} from "./head-object/head-object.command.js";
export type {
  SimCreateBucketCommand,
  SimCreateBucketCommandOutput,
} from "./create-bucket/create-bucket.command.js";
export type {
  SimCopyObjectCommand,
  SimCopyObjectCommandInput,
  SimCopyObjectCommandOutput,
  SimCopyObjectResult,
} from "./copy-object/copy-object.command.js";
export type {
  SimDeleteBucketCommand,
  SimDeleteBucketCommandOutput,
} from "./delete-bucket/delete-bucket.command.js";
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
  SimDeleteBucketLifecycleCommand,
  SimDeleteBucketLifecycleCommandOutput,
} from "./delete-bucket-lifecycle/delete-bucket-lifecycle.command.js";
export type {
  SimGetBucketLifecycleConfigurationCommand,
  SimGetBucketLifecycleConfigurationCommandOutput,
} from "./get-bucket-lifecycle-configuration/get-bucket-lifecycle-configuration.command.js";
export type {
  SimPutBucketLifecycleConfigurationCommand,
  SimPutBucketLifecycleConfigurationCommandOutput,
  SimS3LifecycleConfiguration,
  SimS3LifecycleRule,
} from "./put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";
export type {
  SimGetBucketVersioningCommand,
  SimGetBucketVersioningCommandOutput,
} from "./get-bucket-versioning/get-bucket-versioning.command.js";
export type {
  SimPutBucketVersioningCommand,
  SimPutBucketVersioningCommandOutput,
} from "./put-bucket-versioning/put-bucket-versioning.command.js";
export type {
  SimListObjectVersionsCommand,
  SimListObjectVersionsCommandOutput,
  SimS3DeleteMarkerSummary,
  SimS3ObjectVersionSummary,
} from "./list-object-versions/list-object-versions.command.js";
export type {
  SimGetBucketPolicyCommand,
  SimGetBucketPolicyCommandOutput,
} from "./get-bucket-policy/get-bucket-policy.command.js";
export type {
  SimGetBucketNotificationConfigurationCommand,
  SimGetBucketNotificationConfigurationCommandOutput,
} from "./get-bucket-notification-configuration/get-bucket-notification-configuration.command.js";
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
  SimS3ObjectSummary,
} from "./list-objects/list-objects.command.js";
export type {
  SimListObjectsV2Command,
  SimListObjectsV2CommandOutput,
} from "./list-objects-v2/list-objects-v2.command.js";
export type {
  SimPutBucketNotificationConfigurationCommand,
  SimPutBucketNotificationConfigurationCommandOutput,
} from "./put-bucket-notification-configuration/put-bucket-notification-configuration.command.js";
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
export type {
  SimAbortMultipartUploadCommand,
  SimAbortMultipartUploadCommandOutput,
} from "./abort-multipart-upload/abort-multipart-upload.command.js";
export type {
  SimCompleteMultipartUploadCommand,
  SimCompleteMultipartUploadCommandOutput,
  SimCompletedUploadPart,
} from "./complete-multipart-upload/complete-multipart-upload.command.js";
export type {
  SimCreateMultipartUploadCommand,
  SimCreateMultipartUploadCommandOutput,
} from "./create-multipart-upload/create-multipart-upload.command.js";
export type {
  SimListMultipartUploadsCommand,
  SimListMultipartUploadsCommandOutput,
  SimMultipartUploadSummary,
} from "./list-multipart-uploads/list-multipart-uploads.command.js";
export type {
  SimListPartsCommand,
  SimListPartsCommandOutput,
  SimUploadPartSummary,
} from "./list-parts/list-parts.command.js";
export type {
  SimUploadPartCommand,
  SimUploadPartCommandOutput,
} from "./upload-part/upload-part.command.js";
export type {
  SimPutObjectLockConfigurationCommand,
  SimPutObjectLockConfigurationCommandInput,
  SimPutObjectLockConfigurationCommandOutput,
} from "./put-object-lock-configuration/put-object-lock-configuration.command.js";
export type {
  SimGetObjectLockConfigurationCommand,
  SimGetObjectLockConfigurationCommandInput,
  SimGetObjectLockConfigurationCommandOutput,
} from "./get-object-lock-configuration/get-object-lock-configuration.command.js";
export type {
  SimPutObjectRetentionCommand,
  SimPutObjectRetentionCommandInput,
  SimPutObjectRetentionCommandOutput,
} from "./put-object-retention/put-object-retention.command.js";
export type {
  SimPutObjectLegalHoldCommand,
  SimPutObjectLegalHoldCommandInput,
  SimPutObjectLegalHoldCommandOutput,
} from "./put-object-legal-hold/put-object-legal-hold.command.js";
