import type * as simS3Commands from "./command/sim-s3-command.types.js";
import type { SimS3RequestOptions } from "./command/sim-s3-request-options.js";
import { SimS3VersionOperations } from "./sim-s3-version-operations.js";

/**
 * The AWS operations simulated S3 answers. One delegation per SDK Command,
 * onto the handler in `SimS3Commands` that runs it.
 *
 * `SimS3` extends this. A caller reaches every operation on the one service
 * object, alongside the simulator-only controls `SimS3` holds itself. The
 * operations that make a Bucket keep what it held are on
 * `SimS3VersionOperations`, which this extends.
 */
export abstract class SimS3Operations extends SimS3VersionOperations {
  /** Handle a Create Bucket Command from the SDK. */
  async createBucket(
    command: simS3Commands.SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCreateBucketCommandOutput> {
    return await this.commands.buckets.create(command, options);
  }

  /** Handle a Head Bucket Command from the SDK. */
  async headBucket(
    command: simS3Commands.SimHeadBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimHeadBucketCommandOutput> {
    return await this.commands.buckets.head(command, options);
  }

  /** Handle a Head Object Command from the SDK. */
  async headObject(
    command: simS3Commands.SimHeadObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimHeadObjectCommandOutput> {
    return await this.commands.objects.head(command, options);
  }

  /** Handle a Copy Object Command from the SDK. */
  async copyObject(
    command: simS3Commands.SimCopyObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCopyObjectCommandOutput> {
    return await this.commands.objects.copy(command, options);
  }

  /** Handle a Delete Bucket Command from the SDK. */
  async deleteBucket(
    command: simS3Commands.SimDeleteBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketCommandOutput> {
    return await this.commands.buckets.delete(command, options);
  }

  /** Handle a Put Bucket Policy Command from the SDK. */
  async putBucketPolicy(
    command: simS3Commands.SimPutBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.put(command, options);
  }

  /** Handle a Get Bucket Policy Command from the SDK. */
  async getBucketPolicy(
    command: simS3Commands.SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.get(command, options);
  }

  /** Handle a Delete Bucket Policy Command from the SDK. */
  async deleteBucketPolicy(
    command: simS3Commands.SimDeleteBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketPolicyCommandOutput> {
    return await this.commands.bucketPolicies.delete(command, options);
  }

  /** Handle a Put Public Access Block Command from the SDK. */
  async putPublicAccessBlock(
    command: simS3Commands.SimPutPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutPublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.put(command, options);
  }

  /** Handle a Get Public Access Block Command from the SDK. */
  async getPublicAccessBlock(
    command: simS3Commands.SimGetPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetPublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.get(command, options);
  }

  /** Handle a Delete Public Access Block Command from the SDK. */
  async deletePublicAccessBlock(
    command: simS3Commands.SimDeletePublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeletePublicAccessBlockCommandOutput> {
    return await this.commands.publicAccessBlocks.delete(command, options);
  }

  /** Handle a Put Bucket Website Command from the SDK. */
  async putBucketWebsite(
    command: simS3Commands.SimPutBucketWebsiteCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketWebsiteCommandOutput> {
    return await this.commands.buckets.putWebsite(command, options);
  }

  /** Handle a Put Bucket Notification Configuration Command from the SDK. */
  async putBucketNotificationConfiguration(
    command: simS3Commands.SimPutBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketNotificationConfigurationCommandOutput> {
    return await this.commands.notifications.put(command, options);
  }

  /** Handle a Get Bucket Notification Configuration Command from the SDK. */
  async getBucketNotificationConfiguration(
    command: simS3Commands.SimGetBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketNotificationConfigurationCommandOutput> {
    return await this.commands.notifications.get(command, options);
  }

  /** Handle a Put Bucket Lifecycle Configuration Command from the SDK. */
  async putBucketLifecycleConfiguration(
    command: simS3Commands.SimPutBucketLifecycleConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketLifecycleConfigurationCommandOutput> {
    return await this.commands.lifecycles.put(command, options);
  }

  /** Handle a Get Bucket Lifecycle Configuration Command from the SDK. */
  async getBucketLifecycleConfiguration(
    command: simS3Commands.SimGetBucketLifecycleConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketLifecycleConfigurationCommandOutput> {
    return await this.commands.lifecycles.get(command, options);
  }

  /** Handle a Delete Bucket Lifecycle Command from the SDK. */
  async deleteBucketLifecycle(
    command: simS3Commands.SimDeleteBucketLifecycleCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketLifecycleCommandOutput> {
    return await this.commands.lifecycles.delete(command, options);
  }

  /** Handle a List Buckets Command from the SDK. */
  async listBuckets(
    command: simS3Commands.SimListBucketsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListBucketsCommandOutput> {
    return await this.commands.buckets.list(command, options);
  }

  /** Handle a Put Object Command from the SDK. */
  async putObject(
    command: simS3Commands.SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectCommandOutput> {
    return await this.commands.objects.put(command, options);
  }

  /** Handle a Get Object Command from the SDK. */
  async getObject(
    command: simS3Commands.SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectCommandOutput> {
    return await this.commands.objects.get(command, options);
  }

  /** Handle a Delete Object Command from the SDK. */
  async deleteObject(
    command: simS3Commands.SimDeleteObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectCommandOutput> {
    return await this.commands.objects.delete(command, options);
  }

  /** Handle a Delete Objects Command from the SDK. */
  async deleteObjects(
    command: simS3Commands.SimDeleteObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectsCommandOutput> {
    return await this.commands.objects.deleteMany(command, options);
  }

  /** Handle a List Objects Command from the SDK. */
  async listObjects(
    command: simS3Commands.SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsCommandOutput> {
    return await this.commands.objects.list(command, options);
  }

  /** Handle a List Objects V2 Command from the SDK. */
  async listObjectsV2(
    command: simS3Commands.SimListObjectsV2Command,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsV2CommandOutput> {
    return await this.commands.objects.listV2(command, options);
  }

  /** Handle a Create Multipart Upload Command from the SDK. */
  async createMultipartUpload(
    command: simS3Commands.SimCreateMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCreateMultipartUploadCommandOutput> {
    return await this.commands.multipartUploads.create(command, options);
  }

  /** Handle an Upload Part Command from the SDK. */
  async uploadPart(
    command: simS3Commands.SimUploadPartCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimUploadPartCommandOutput> {
    return await this.commands.multipartUploads.uploadPart(command, options);
  }

  /** Handle a Complete Multipart Upload Command from the SDK. */
  async completeMultipartUpload(
    command: simS3Commands.SimCompleteMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCompleteMultipartUploadCommandOutput> {
    return await this.commands.multipartUploads.complete(command, options);
  }

  /** Handle an Abort Multipart Upload Command from the SDK. */
  async abortMultipartUpload(
    command: simS3Commands.SimAbortMultipartUploadCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimAbortMultipartUploadCommandOutput> {
    return await this.commands.multipartUploads.abort(command, options);
  }

  /** Handle a List Multipart Uploads Command from the SDK. */
  async listMultipartUploads(
    command: simS3Commands.SimListMultipartUploadsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListMultipartUploadsCommandOutput> {
    return await this.commands.multipartUploads.list(command, options);
  }

  /** Handle a List Parts Command from the SDK. */
  async listParts(
    command: simS3Commands.SimListPartsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListPartsCommandOutput> {
    return await this.commands.multipartUploads.listParts(command, options);
  }
}
