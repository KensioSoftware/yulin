import { DeleteObjectTaggingCommandHandler } from "../delete-object-tagging/delete-object-tagging.handler.js";
import { GetObjectTaggingCommandHandler } from "../get-object-tagging/get-object-tagging.handler.js";
import { PutObjectTaggingCommandHandler } from "../put-object-tagging/put-object-tagging.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The Object tagging commands of one simulated S3 scope.
 *
 * Real S3 holds tags against an Object without rewriting it, and grants each of
 * the three a permission of its own, which is why they are an area rather than
 * three more Object commands.
 */
export class SimS3ObjectTaggingCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Replace the tags on an Object.
   */
  async put(
    command: simS3Commands.SimPutObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectTaggingCommandOutput> {
    return await new PutObjectTaggingCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read the tags on an Object.
   */
  async get(
    command: simS3Commands.SimGetObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectTaggingCommandOutput> {
    return await new GetObjectTaggingCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Take every tag off an Object.
   */
  async delete(
    command: simS3Commands.SimDeleteObjectTaggingCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimDeleteObjectTaggingCommandOutput> {
    return await new DeleteObjectTaggingCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
