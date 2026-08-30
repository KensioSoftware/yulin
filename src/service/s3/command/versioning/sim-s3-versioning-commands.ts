import { GetBucketVersioningCommandHandler } from "../get-bucket-versioning/get-bucket-versioning.handler.js";
import { ListObjectVersionsCommandHandler } from "../list-object-versions/list-object-versions.handler.js";
import { PutBucketVersioningCommandHandler } from "../put-bucket-versioning/put-bucket-versioning.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The versioning commands of one simulated S3 scope.
 *
 * Listing the versions belongs here rather than with the Object listings,
 * because what it reports is the version history rather than the keys a Bucket
 * currently holds, and it is governed by its own IAM action.
 */
export class SimS3VersioningCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Apply a Bucket's versioning configuration.
   */
  async put(
    command: simS3Commands.SimPutBucketVersioningCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketVersioningCommandOutput> {
    return await new PutBucketVersioningCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read how a Bucket is versioned.
   */
  async get(
    command: simS3Commands.SimGetBucketVersioningCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketVersioningCommandOutput> {
    return await new GetBucketVersioningCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * List the versions a Bucket holds.
   */
  async list(
    command: simS3Commands.SimListObjectVersionsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectVersionsCommandOutput> {
    return await new ListObjectVersionsCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
