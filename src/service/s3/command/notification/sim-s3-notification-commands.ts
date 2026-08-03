import { GetBucketNotificationConfigurationCommandHandler } from "../get-bucket-notification-configuration/get-bucket-notification-configuration.handler.js";
import { PutBucketNotificationConfigurationCommandHandler } from "../put-bucket-notification-configuration/put-bucket-notification-configuration.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The event notification commands of one simulated S3 scope.
 */
export class SimS3NotificationCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Replace a Bucket's event notification configuration.
   */
  async put(
    command: simS3Commands.SimPutBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketNotificationConfigurationCommandOutput> {
    return await new PutBucketNotificationConfigurationCommandHandler(
      this.state,
    ).handle(command, options);
  }

  /**
   * Read a Bucket's event notification configuration.
   */
  async get(
    command: simS3Commands.SimGetBucketNotificationConfigurationCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketNotificationConfigurationCommandOutput> {
    return await new GetBucketNotificationConfigurationCommandHandler(
      this.state,
    ).handle(command, options);
  }
}
