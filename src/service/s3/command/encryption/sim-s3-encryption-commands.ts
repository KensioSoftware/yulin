import { DeleteBucketEncryptionCommandHandler } from "../delete-bucket-encryption/delete-bucket-encryption.handler.js";
import { GetBucketEncryptionCommandHandler } from "../get-bucket-encryption/get-bucket-encryption.handler.js";
import { PutBucketEncryptionCommandHandler } from "../put-bucket-encryption/put-bucket-encryption.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The default encryption commands of one simulated S3 scope.
 */
export class SimS3EncryptionCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Apply a Bucket's default encryption.
   */
  async put(
    command: simS3Commands.SimPutBucketEncryptionCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutBucketEncryptionCommandOutput> {
    return await new PutBucketEncryptionCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read a Bucket's default encryption.
   */
  async get(
    command: simS3Commands.SimGetBucketEncryptionCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetBucketEncryptionCommandOutput> {
    return await new GetBucketEncryptionCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Put a Bucket back to the encryption every Bucket has.
   */
  async delete(
    command: simS3Commands.SimDeleteBucketEncryptionCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteBucketEncryptionCommandOutput> {
    return await new DeleteBucketEncryptionCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
