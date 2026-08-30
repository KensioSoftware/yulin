import { GetObjectLockConfigurationCommandHandler } from "../get-object-lock-configuration/get-object-lock-configuration.handler.js";
import { PutObjectLegalHoldCommandHandler } from "../put-object-legal-hold/put-object-legal-hold.handler.js";
import { PutObjectLockConfigurationCommandHandler } from "../put-object-lock-configuration/put-object-lock-configuration.handler.js";
import { PutObjectRetentionCommandHandler } from "../put-object-retention/put-object-retention.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The Object Lock commands of one simulated S3 scope.
 *
 * Two of them configure a Bucket and two of them hold one version of one
 * Object, and they are kept together because a version can only be held on a
 * Bucket the first two turned Object Lock on for.
 */
export class SimS3ObjectLockCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Turn Object Lock on for a Bucket, with the default retention it carries.
   */
  async putConfiguration(
    command: simS3Commands.SimPutObjectLockConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectLockConfigurationCommandOutput> {
    return await new PutObjectLockConfigurationCommandHandler(
      this.state,
    ).handle(command, options);
  }

  /**
   * Read how a Bucket is locked.
   */
  async getConfiguration(
    command: simS3Commands.SimGetObjectLockConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectLockConfigurationCommandOutput> {
    return await new GetObjectLockConfigurationCommandHandler(
      this.state,
    ).handle(command, options);
  }

  /**
   * Put a retention period on one version.
   */
  async putRetention(
    command: simS3Commands.SimPutObjectRetentionCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectRetentionCommandOutput> {
    return await new PutObjectRetentionCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Turn the legal hold on one version on or off.
   */
  async putLegalHold(
    command: simS3Commands.SimPutObjectLegalHoldCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectLegalHoldCommandOutput> {
    return await new PutObjectLegalHoldCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
