import { DeleteBucketLifecycleCommandHandler } from "../delete-bucket-lifecycle/delete-bucket-lifecycle.handler.js";
import { GetBucketLifecycleConfigurationCommandHandler } from "../get-bucket-lifecycle-configuration/get-bucket-lifecycle-configuration.handler.js";
import { PutBucketLifecycleConfigurationCommandHandler } from "../put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The lifecycle configuration commands of one simulated S3 scope.
 */
export class SimS3LifecycleCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Replace a Bucket's lifecycle rules.
   */
  async put(
    command: simS3Commands.SimPutBucketLifecycleConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketLifecycleConfigurationCommandOutput> {
    return await new PutBucketLifecycleConfigurationCommandHandler(
      this.state,
    ).handle(command, options);
  }

  /**
   * Read a Bucket's lifecycle rules.
   */
  async get(
    command: simS3Commands.SimGetBucketLifecycleConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketLifecycleConfigurationCommandOutput> {
    return await new GetBucketLifecycleConfigurationCommandHandler(
      this.state,
    ).handle(command, options);
  }

  /**
   * Remove a Bucket's lifecycle rules.
   */
  async delete(
    command: simS3Commands.SimDeleteBucketLifecycleCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketLifecycleCommandOutput> {
    return await new DeleteBucketLifecycleCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
