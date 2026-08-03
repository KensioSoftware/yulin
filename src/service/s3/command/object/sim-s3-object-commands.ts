import { GetObjectCommandHandler } from "../get-object/get-object.handler.js";
import { ListObjectsCommandHandler } from "../list-objects/list-objects.handler.js";
import { PutObjectCommandHandler } from "../put-object/put-object.handler.js";
import type { SimS3BucketCommandState } from "../sim-s3-bucket-command-state.js";
import type * as simS3Commands from "../sim-s3-command.types.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

/**
 * The Object commands of one simulated S3 scope.
 */
export class SimS3ObjectCommands {
  private readonly state: SimS3BucketCommandState;

  constructor(state: SimS3BucketCommandState) {
    this.state = state;
  }

  /**
   * Store an Object in a Bucket.
   */
  async put(
    command: simS3Commands.SimPutObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimPutObjectCommandOutput> {
    return await new PutObjectCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * Read an Object from a Bucket.
   */
  async get(
    command: simS3Commands.SimGetObjectCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimGetObjectCommandOutput> {
    return await new GetObjectCommandHandler(this.state).handle(
      command,
      options,
    );
  }

  /**
   * List the Objects in a Bucket.
   */
  async list(
    command: simS3Commands.SimListObjectsCommand,
    options?: SimS3RequestOptions,
  ): Promise<simS3Commands.SimListObjectsCommandOutput> {
    return await new ListObjectsCommandHandler(this.state).handle(
      command,
      options,
    );
  }
}
