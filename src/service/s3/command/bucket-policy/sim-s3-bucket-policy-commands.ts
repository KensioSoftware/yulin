import { DeleteBucketPolicyCommandHandler } from "../delete-bucket-policy/delete-bucket-policy.handler.js";
import { GetBucketPolicyCommandHandler } from "../get-bucket-policy/get-bucket-policy.handler.js";
import { PutBucketPolicyCommandHandler } from "../put-bucket-policy/put-bucket-policy.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The Bucket resource policy commands of one simulated S3 scope.
 */
export class SimS3BucketPolicyCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Replace a Bucket's resource policy.
   */
  async put(
    command: simS3Commands.SimPutBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketPolicyCommandOutput> {
    return await new PutBucketPolicyCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read a Bucket's resource policy.
   */
  async get(
    command: simS3Commands.SimGetBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketPolicyCommandOutput> {
    return await new GetBucketPolicyCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Remove a Bucket's resource policy.
   */
  async delete(
    command: simS3Commands.SimDeleteBucketPolicyCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketPolicyCommandOutput> {
    return await new DeleteBucketPolicyCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
