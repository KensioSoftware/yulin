import { DeletePublicAccessBlockCommandHandler } from "../delete-public-access-block/delete-public-access-block.handler.js";
import { GetPublicAccessBlockCommandHandler } from "../get-public-access-block/get-public-access-block.handler.js";
import { PutPublicAccessBlockCommandHandler } from "../put-public-access-block/put-public-access-block.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The Block Public Access commands of one simulated S3 scope.
 */
export class SimS3PublicAccessBlockCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Replace a Bucket's Block Public Access settings.
   */
  async put(
    command: simS3Commands.SimPutPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutPublicAccessBlockCommandOutput> {
    return await new PutPublicAccessBlockCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read a Bucket's Block Public Access settings.
   */
  async get(
    command: simS3Commands.SimGetPublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetPublicAccessBlockCommandOutput> {
    return await new GetPublicAccessBlockCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Remove a Bucket's Block Public Access settings.
   */
  async delete(
    command: simS3Commands.SimDeletePublicAccessBlockCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeletePublicAccessBlockCommandOutput> {
    return await new DeletePublicAccessBlockCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
