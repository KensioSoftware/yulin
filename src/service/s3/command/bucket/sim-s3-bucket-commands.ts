import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimS3GlobalRegistry } from "../../sim-s3-global-registry.js";
import { CreateBucketCommandHandler } from "../create-bucket/create-bucket.handler.js";
import { DeleteBucketCommandHandler } from "../delete-bucket/delete-bucket.handler.js";
import { ListBucketsCommandHandler } from "../list-buckets/list-buckets.handler.js";
import { PutBucketWebsiteCommandHandler } from "../put-bucket-website/put-bucket-website.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface SimS3BucketCommandsProperties extends SimS3BucketCommandState {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly s3GlobalRegistry: SimS3GlobalRegistry;
}

/**
 * The Bucket commands of one simulated S3 scope.
 *
 * Creating a Bucket also registers it in the cross-Region registry, so this
 * area carries the Account Region scope and that registry as well as the shared
 * Bucket state.
 */
export class SimS3BucketCommands {
  private readonly properties: SimS3BucketCommandsProperties;

  constructor(properties: SimS3BucketCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Create a Bucket in this scope and register it globally.
   */
  async create(
    command: simS3Commands.SimCreateBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimCreateBucketCommandOutput> {
    return await new CreateBucketCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Delete a Bucket from this scope and release its name globally.
   */
  async delete(
    command: simS3Commands.SimDeleteBucketCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketCommandOutput> {
    return await new DeleteBucketCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * List the Buckets this scope owns.
   */
  async list(
    command: simS3Commands.SimListBucketsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListBucketsCommandOutput> {
    return await new ListBucketsCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Configure static website hosting on a Bucket.
   */
  async putWebsite(
    command: simS3Commands.SimPutBucketWebsiteCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketWebsiteCommandOutput> {
    return await new PutBucketWebsiteCommandHandler(this.properties).handle(
      command,
      options,
    );
  }
}
